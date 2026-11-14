
from pathlib import Path
from datetime import date
from math import radians, sin

import csv
import io
import duckdb
from flask import Flask, jsonify, request, render_template, Response

ROOT = Path(__file__).resolve().parents[1]
DB_FILE = ROOT / "data" / "processed" / "firetrace.duckdb"

app = Flask(__name__)

DEFAULT_START = "2000-11-01"
DEFAULT_END = "2026-11-12"

GRID_SIZE = 0.25
EARTH_RADIUS_KM = 6371.0088


def get_filters():
    sensor = request.args.get("sensor", "ALL").upper()
    satellite = request.args.get("satellite", "ALL").upper()
    stream = request.args.get("stream", "ALL").upper()

    if sensor not in ("ALL", "MODIS", "VIIRS"):
        return None, "Invalid sensor filter."

    if satellite not in ("ALL", "TERRA", "AQUA", "SNPP", "N20", "N21"):
        return None, "Invalid satellite filter."

    if stream not in ("ALL", "ARCHIVE", "NRT"):
        return None, "Invalid data stream filter."

    return {
        "sensor": sensor,
        "satellite": satellite,
        "stream": stream
    }, None


def validate_dates(start, end):
    try:
        date.fromisoformat(start)
        date.fromisoformat(end)
    except (ValueError, TypeError):
        return False

    return start <= end


def get_date_range():
    start = request.args.get("start", DEFAULT_START)
    end = request.args.get("end", DEFAULT_END)

    if not validate_dates(start, end):
        return None, None, (
            "Invalid date range. Use YYYY-MM-DD "
            "and ensure start is not after end."
        )

    return start, end, None


def get_query_params(start, end, filters):
    return [
        start, end,
        filters["sensor"], filters["sensor"],
        filters["satellite"], filters["satellite"],
        filters["stream"], filters["stream"]
    ]


def calculate_grid_area(lat):
    """
    Approximate spherical area of a 0.25-degree grid cell.

    Latitude boundaries are derived from the grid row.
    Longitude width is calculated using the spherical
    surface-area formula, so cell area varies by latitude.
    """
    south = int(lat / GRID_SIZE) * GRID_SIZE
    north = south + GRID_SIZE

    longitude_width = radians(GRID_SIZE)

    area = (
        EARTH_RADIUS_KM ** 2
        * longitude_width
        * (sin(radians(north)) - sin(radians(south)))
    )

    return area


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/hotspots")
def hotspots():
    start, end, error = get_date_range()
    if error:
        return jsonify({"error": error}), 400

    filters, error = get_filters()
    if error:
        return jsonify({"error": error}), 400

    query = """
        SELECT
            FLOOR(latitude / 0.25) * 0.25 + 0.125 AS lat,
            FLOOR(longitude / 0.25) * 0.25 + 0.125 AS lon,
            COUNT(*) AS detections,
            AVG(frp) AS avg_frp
        FROM observations
        WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
          AND (? = 'ALL' OR sensor_family = ?)
          AND (? = 'ALL' OR UPPER(satellite) = ?)
          AND (? = 'ALL' OR data_stream = ?)
        GROUP BY 1, 2
        ORDER BY detections DESC
    """

    params = get_query_params(start, end, filters)

    try:
        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            rows = con.execute(query, params).fetchall()

        results = [
            {
                "lat": float(row[0]),
                "lon": float(row[1]),
                "detections": int(row[2]),
                "avg_frp": round(float(row[3]), 2)
                if row[3] is not None else None
            }
            for row in rows
        ]

        return jsonify({
            "filters": {
                "start": start,
                "end": end,
                **filters
            },
            "grid_resolution_degrees": GRID_SIZE,
            "total_grid_cells": len(results),
            "total_detections": sum(
                item["detections"] for item in results
            ),
            "data": results
        })

    except Exception:
        app.logger.exception("Hotspot query failed")
        return jsonify({
            "error": "Unable to query hotspot data."
        }), 500


@app.route("/api/calendar")
def calendar():
    filters, error = get_filters()
    if error:
        return jsonify({"error": error}), 400

    query = """
        SELECT
            EXTRACT(YEAR FROM acq_date)::INTEGER AS year,
            EXTRACT(MONTH FROM acq_date)::INTEGER AS month,
            COUNT(*) AS detections
        FROM observations
        WHERE (? = 'ALL' OR sensor_family = ?)
          AND (? = 'ALL' OR UPPER(satellite) = ?)
          AND (? = 'ALL' OR data_stream = ?)
        GROUP BY year, month
        ORDER BY year, month
    """

    params = [
        filters["sensor"], filters["sensor"],
        filters["satellite"], filters["satellite"],
        filters["stream"], filters["stream"]
    ]

    try:
        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            rows = con.execute(query, params).fetchall()

        results = [
            {
                "year": int(row[0]),
                "month": int(row[1]),
                "detections": int(row[2])
            }
            for row in rows
        ]

        return jsonify({
            "filters": filters,
            "total_detections": sum(
                item["detections"] for item in results
            ),
            "months_with_data": len(results),
            "data": results
        })

    except Exception:
        app.logger.exception("Calendar query failed")
        return jsonify({
            "error": "Unable to calculate activity calendar."
        }), 500


@app.route("/api/sensor-comparison")
def sensor_comparison():
    start, end, error = get_date_range()
    if error:
        return jsonify({"error": error}), 400

    stream = request.args.get("stream", "ALL").upper()

    if stream not in ("ALL", "ARCHIVE", "NRT"):
        return jsonify({
            "error": "Invalid data stream filter."
        }), 400

    monthly_query = """
        SELECT
            sensor_family,
            EXTRACT(YEAR FROM acq_date)::INTEGER AS year,
            EXTRACT(MONTH FROM acq_date)::INTEGER AS month,
            COUNT(*) AS detections
        FROM observations
        WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
          AND (? = 'ALL' OR data_stream = ?)
        GROUP BY sensor_family, year, month
        ORDER BY year, month, sensor_family
    """

    platform_query = """
        SELECT
            sensor_family,
            satellite,
            COUNT(*) AS detections
        FROM observations
        WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
          AND (? = 'ALL' OR data_stream = ?)
        GROUP BY sensor_family, satellite
        ORDER BY sensor_family, detections DESC
    """

    params = [start, end, stream, stream]

    try:
        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            monthly_rows = con.execute(
                monthly_query, params
            ).fetchall()

            platform_rows = con.execute(
                platform_query, params
            ).fetchall()

        monthly = [
            {
                "sensor": row[0],
                "year": int(row[1]),
                "month": int(row[2]),
                "detections": int(row[3])
            }
            for row in monthly_rows
        ]

        platforms = [
            {
                "sensor": row[0],
                "satellite": row[1],
                "detections": int(row[2])
            }
            for row in platform_rows
        ]

        totals = {"MODIS": 0, "VIIRS": 0}
        months_with_data = {"MODIS": 0, "VIIRS": 0}

        for item in monthly:
            totals[item["sensor"]] += item["detections"]
            months_with_data[item["sensor"]] += 1

        return jsonify({
            "period": {
                "start": start,
                "end": end
            },
            "data_stream": stream,
            "comparison_basis": (
                "Satellite detection observations, "
                "not unique fire incidents."
            ),
            "totals": totals,
            "months_with_data": months_with_data,
            "monthly": monthly,
            "platforms": platforms,
            "scientific_note": (
                "MODIS and VIIRS have different spatial resolutions, "
                "observation characteristics and operational periods. "
                "Their detection counts are not directly equivalent "
                "to counts of unique fires."
            )
        })

    except Exception:
        app.logger.exception("Sensor comparison query failed")
        return jsonify({
            "error": "Unable to calculate sensor comparison."
        }), 500


@app.route("/api/persistence")
def persistence():
    start, end, error = get_date_range()
    if error:
        return jsonify({"error": error}), 400

    filters, error = get_filters()
    if error:
        return jsonify({"error": error}), 400

    try:
        limit = int(request.args.get("limit", "20"))
    except ValueError:
        return jsonify({
            "error": "Limit must be an integer."
        }), 400

    if limit < 1 or limit > 100:
        return jsonify({
            "error": "Limit must be between 1 and 100."
        }), 400

    query = """
        SELECT
            FLOOR(latitude / 0.25) * 0.25 + 0.125 AS lat,
            FLOOR(longitude / 0.25) * 0.25 + 0.125 AS lon,
            COUNT(*) AS detections,
            COUNT(DISTINCT DATE_TRUNC('month', acq_date)) AS active_months,
            COUNT(DISTINCT EXTRACT(YEAR FROM acq_date)) AS active_years,
            MIN(acq_date) AS first_detection,
            MAX(acq_date) AS latest_detection,
            AVG(frp) AS avg_frp,
            MAX(frp) AS max_frp
        FROM observations
        WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
          AND (? = 'ALL' OR sensor_family = ?)
          AND (? = 'ALL' OR UPPER(satellite) = ?)
          AND (? = 'ALL' OR data_stream = ?)
        GROUP BY 1, 2
        ORDER BY active_years DESC, active_months DESC, detections DESC
        LIMIT ?
    """

    params = get_query_params(start, end, filters) + [limit]

    summary_query = """
        SELECT
            COUNT(*) AS grid_cells,
            SUM(detections) AS total_detections,
            MAX(active_months) AS maximum_active_months,
            MAX(active_years) AS maximum_active_years
        FROM (
            SELECT
                FLOOR(latitude / 0.25) * 0.25 + 0.125 AS lat,
                FLOOR(longitude / 0.25) * 0.25 + 0.125 AS lon,
                COUNT(*) AS detections,
                COUNT(DISTINCT DATE_TRUNC('month', acq_date)) AS active_months,
                COUNT(DISTINCT EXTRACT(YEAR FROM acq_date)) AS active_years
            FROM observations
            WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
              AND (? = 'ALL' OR sensor_family = ?)
              AND (? = 'ALL' OR UPPER(satellite) = ?)
              AND (? = 'ALL' OR data_stream = ?)
            GROUP BY 1, 2
        ) cells
    """

    summary_params = get_query_params(start, end, filters)

    try:
        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            rows = con.execute(query, params).fetchall()
            summary_row = con.execute(
                summary_query, summary_params
            ).fetchone()

        results = [
            {
                "rank": index + 1,
                "lat": float(row[0]),
                "lon": float(row[1]),
                "detections": int(row[2]),
                "active_months": int(row[3]),
                "active_years": int(row[4]),
                "first_detection": row[5].isoformat(),
                "latest_detection": row[6].isoformat(),
                "avg_frp": round(float(row[7]), 2)
                if row[7] is not None else None,
                "max_frp": round(float(row[8]), 2)
                if row[8] is not None else None
            }
            for index, row in enumerate(rows)
        ]

        return jsonify({
            "period": {
                "start": start,
                "end": end
            },
            "filters": filters,
            "grid_resolution_degrees": GRID_SIZE,
            "ranking_basis": (
                "Active years, then active months, "
                "then detection count."
            ),
            "summary": {
                "total_grid_cells": int(summary_row[0] or 0),
                "total_detections": int(summary_row[1] or 0),
                "maximum_active_months": int(summary_row[2] or 0),
                "maximum_active_years": int(summary_row[3] or 0)
            },
            "returned_cells": len(results),
            "data": results,
            "scientific_note": (
                "Persistence describes repeated satellite detections "
                "in the same 0.25-degree grid cell over time. It does "
                "not establish that one fire persisted continuously, "
                "nor does it identify unique fires. FRP is reported as "
                "an observed satellite indicator, not a direct "
                "measurement of total fire energy."
            )
        })

    except Exception:
        app.logger.exception("Persistence analysis failed")
        return jsonify({
            "error": "Unable to calculate hotspot persistence."
        }), 500


@app.route("/api/concentration")
def concentration():
    start, end, error = get_date_range()
    if error:
        return jsonify({"error": error}), 400

    filters, error = get_filters()
    if error:
        return jsonify({"error": error}), 400

    try:
        limit = int(request.args.get("limit", "20"))
    except ValueError:
        return jsonify({
            "error": "Limit must be an integer."
        }), 400

    if limit < 1 or limit > 100:
        return jsonify({
            "error": "Limit must be between 1 and 100."
        }), 400

    query = """
        SELECT
            FLOOR(latitude / 0.25) * 0.25 + 0.125 AS lat,
            FLOOR(longitude / 0.25) * 0.25 + 0.125 AS lon,
            COUNT(*) AS detections,
            AVG(frp) AS avg_frp,
            MAX(frp) AS max_frp,
            MIN(acq_date) AS first_detection,
            MAX(acq_date) AS latest_detection
        FROM observations
        WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
          AND (? = 'ALL' OR sensor_family = ?)
          AND (? = 'ALL' OR UPPER(satellite) = ?)
          AND (? = 'ALL' OR data_stream = ?)
        GROUP BY 1, 2
        ORDER BY detections DESC, lat, lon
    """

    params = get_query_params(start, end, filters)

    try:
        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            rows = con.execute(query, params).fetchall()

        all_cells = []

        for row in rows:
            lat = float(row[0])
            lon = float(row[1])
            detections = int(row[2])

            area_km2 = calculate_grid_area(lat)
            density = detections / area_km2 if area_km2 > 0 else 0

            all_cells.append({
                "lat": lat,
                "lon": lon,
                "detections": detections,
                "area_km2": round(area_km2, 3),
                "detections_per_km2": round(density, 4),
                "avg_frp": round(float(row[3]), 2)
                if row[3] is not None else None,
                "max_frp": round(float(row[4]), 2)
                if row[4] is not None else None,
                "first_detection": row[5].isoformat(),
                "latest_detection": row[6].isoformat()
            })

        # Primary ranking: total detections.
        # Secondary ranking: detections per square kilometre.
        all_cells.sort(
            key=lambda item: (
                -item["detections"],
                -item["detections_per_km2"],
                item["lat"],
                item["lon"]
            )
        )

        results = []

        for index, item in enumerate(all_cells[:limit]):
            results.append({
                "rank": index + 1,
                **item
            })

        total_detections = sum(
            item["detections"] for item in all_cells
        )

        total_area = sum(
            item["area_km2"] for item in all_cells
        )

        maximum_density = max(
            (item["detections_per_km2"] for item in all_cells),
            default=0
        )

        maximum_detections = max(
            (item["detections"] for item in all_cells),
            default=0
        )

        return jsonify({
            "period": {
                "start": start,
                "end": end
            },
            "filters": filters,
            "grid_resolution_degrees": GRID_SIZE,
            "ranking_basis": (
                "Total detection observations per grid cell, "
                "with detection density per square kilometre "
                "as the secondary ranking criterion."
            ),
            "density_unit": "detections per square kilometre",
            "summary": {
                "total_grid_cells": len(all_cells),
                "total_detections": total_detections,
                "total_grid_area_km2": round(total_area, 3),
                "maximum_cell_detections": maximum_detections,
                "maximum_cell_density_per_km2": round(
                    maximum_density, 4
                )
            },
            "returned_cells": len(results),
            "data": results,
            "scientific_note": (
                "Concentration represents the number of satellite "
                "detection observations assigned to each 0.25-degree "
                "grid cell during the selected period. Detection "
                "density divides this count by the approximate "
                "spherical area of that grid cell. Cell area varies "
                "with latitude. These measurements describe the "
                "spatial concentration of observations, not unique "
                "fires, burned area, fire boundaries or fire causes. "
                "Repeated observations may relate to the same fire."
            )
        })

    except Exception:
        app.logger.exception("Concentration analysis failed")
        return jsonify({
            "error": "Unable to calculate hotspot concentration."
        }), 500

@app.route("/api/seasonality")
def seasonality():
    try:
        query = """
            WITH monthly AS (
                SELECT
                    sensor_family,
                    YEAR(acq_date) AS year,
                    MONTH(acq_date) AS month,
                    COUNT(*) AS detections
                FROM observations
                WHERE data_stream = 'ARCHIVE'
                  AND (
                    (sensor_family = 'MODIS'
                     AND YEAR(acq_date) BETWEEN 2001 AND 2025)
                    OR
                    (sensor_family = 'VIIRS'
                     AND YEAR(acq_date) BETWEEN 2012 AND 2025)
                  )
                GROUP BY 1, 2, 3
            ),
            annual AS (
                SELECT
                    sensor_family,
                    year,
                    SUM(detections) AS annual_detections
                FROM monthly
                GROUP BY 1, 2
            ),
            shares AS (
                SELECT
                    m.sensor_family,
                    m.month,
                    m.year,
                    m.detections,
                    100.0 * m.detections /
                        NULLIF(a.annual_detections, 0)
                        AS monthly_share_pct
                FROM monthly m
                JOIN annual a
                  ON m.sensor_family = a.sensor_family
                 AND m.year = a.year
            )
            SELECT
                sensor_family,
                month,
                COUNT(DISTINCT year) AS years,
                SUM(detections) AS total_detections,
                AVG(monthly_share_pct) AS avg_monthly_share_pct,
                STDDEV_SAMP(monthly_share_pct) AS variation_pct
            FROM shares
            GROUP BY 1, 2
            ORDER BY 1, 2
        """

        partial_query = """
            SELECT
                sensor_family,
                YEAR(acq_date) AS year,
                MONTH(acq_date) AS month,
                COUNT(*) AS detections,
                MIN(acq_date) AS first_date,
                MAX(acq_date) AS last_date
            FROM observations
            WHERE data_stream = 'ARCHIVE'
              AND YEAR(acq_date) IN (2000, 2026)
            GROUP BY 1, 2, 3
            ORDER BY 1, 2, 3
        """

        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            historical_rows = con.execute(query).fetchall()
            partial_rows = con.execute(partial_query).fetchall()

        historical = []

        for row in historical_rows:
            historical.append({
                "sensor_family": row[0],
                "month": int(row[1]),
                "years": int(row[2]),
                "total_detections": int(row[3]),
                "avg_monthly_share_pct": round(float(row[4]), 2),
                "variation_pct": round(float(row[5]), 2)
                if row[5] is not None else None
            })

        partial = []

        for row in partial_rows:
            partial.append({
                "sensor_family": row[0],
                "year": int(row[1]),
                "month": int(row[2]),
                "detections": int(row[3]),
                "first_date": row[4].isoformat(),
                "last_date": row[5].isoformat()
            })

        return jsonify({
            "historical_periods": {
                "MODIS": "2001-2025",
                "VIIRS": "2012-2025"
            },
            "historical_metric": (
                "Average monthly percentage of each year's "
                "annual sensor-family detections."
            ),
            "historical_data": historical,
            "partial_year_data": partial,
            "scientific_note": (
                "MODIS and VIIRS are analyzed separately. Monthly "
                "percentages are calculated within each year before "
                "averaging across years. This reduces the influence "
                "of differences in annual detection totals, but does "
                "not eliminate changes in satellite availability, "
                "sensor characteristics, or observation coverage. "
                "Detections are satellite observations, not unique "
                "fires. The years 2000 and 2026 are partial and are "
                "excluded from the historical seasonal averages. "
                "NRT observations are excluded."
            )
        })

    except Exception:
        app.logger.exception("Seasonal analysis failed")
        return jsonify({
            "error": "Unable to calculate seasonal activity."
        }), 500


@app.route("/api/harmonization")
def harmonization():
    try:
        start_date = request.args.get("start", DEFAULT_START)
        end_date = request.args.get("end", DEFAULT_END)

        with duckdb.connect(str(DB_FILE), read_only=True) as con:
            query = """
                WITH weekly AS (
                    SELECT
                        sensor_family,
                        (FLOOR(latitude / 0.25) + 0.5) * 0.25 AS grid_lat,
                        (FLOOR(longitude / 0.25) + 0.5) * 0.25 AS grid_lon,
                        DATE_TRUNC('week', acq_date)::DATE AS week,
                        COUNT(*) AS detections
                    FROM observations
                    WHERE data_stream = 'ARCHIVE'
                      AND acq_date BETWEEN ? AND ?
                    GROUP BY 1, 2, 3, 4
                ),
                weekly_totals AS (
                    SELECT sensor_family, week,
                           SUM(detections) AS total_detections
                    FROM weekly
                    GROUP BY 1, 2
                ),
                normalized AS (
                    SELECT
                        w.*,
                        w.detections * 100000.0 /
                        NULLIF(t.total_detections, 0) AS activity_index
                    FROM weekly w
                    JOIN weekly_totals t
                      ON w.sensor_family = t.sensor_family
                     AND w.week = t.week
                ),
                combined AS (
                    SELECT
                        grid_lat, grid_lon, week,
                        MAX(CASE WHEN sensor_family = 'MODIS'
                            THEN detections ELSE 0 END) AS modis,
                        MAX(CASE WHEN sensor_family = 'VIIRS'
                            THEN detections ELSE 0 END) AS viirs,
                        MAX(CASE WHEN sensor_family = 'MODIS'
                            THEN activity_index END) AS modis_index,
                        MAX(CASE WHEN sensor_family = 'VIIRS'
                            THEN activity_index END) AS viirs_index
                    FROM normalized
                    GROUP BY 1, 2, 3
                ),
                classified AS (
                    SELECT *,
                        CASE
                            WHEN modis > 0 AND viirs > 0 THEN 'BOTH'
                            WHEN modis > 0 THEN 'MODIS_ONLY'
                            ELSE 'VIIRS_ONLY'
                        END AS agreement
                    FROM combined
                )
                SELECT * FROM classified
            """

            con.execute("CREATE TEMP TABLE harmonized_rows AS " + query, [start_date, end_date])

            categories = con.execute("""
                SELECT agreement,
                       COUNT(*) AS cell_weeks,
                       COUNT(DISTINCT (grid_lat, grid_lon)) AS unique_cells
                FROM harmonized_rows
                GROUP BY agreement
            """).fetchall()

            comparison = con.execute("""
                SELECT
                    COUNT(*) FILTER (
                        WHERE modis > 0 AND viirs > 0
                    ),
                    CORR(modis_index, viirs_index) FILTER (
                        WHERE modis > 0 AND viirs > 0
                    ),
                    AVG(modis_index) FILTER (
                        WHERE modis > 0 AND viirs > 0
                    ),
                    AVG(viirs_index) FILTER (
                        WHERE modis > 0 AND viirs > 0
                    )
                FROM harmonized_rows
            """).fetchone()

        summary = {
            name: {"cell_weeks": 0, "unique_cells": 0}
            for name in ("BOTH", "MODIS_ONLY", "VIIRS_ONLY")
        }

        for category, cell_weeks, unique_cells in categories:
            summary[category] = {
                "cell_weeks": cell_weeks,
                "unique_cells": unique_cells
            }

        return jsonify({
            "period": {
                "start": start_date,
                "end": end_date
            },
            "grid_size_degrees": 0.25,
            "time_interval": "weekly",
            "normalization": (
                "Grid-cell detections per 100,000 detections "
                "recorded by the same sensor family in that week."
            ),
            "summary": summary,
            "normalized_comparison": {
                "shared_cell_weeks": comparison[0],
                "pearson_correlation": (
                    round(comparison[1], 4)
                    if comparison[1] is not None else None
                ),
                "mean_modis_index": (
                    round(comparison[2], 4)
                    if comparison[2] is not None else None
                ),
                "mean_viirs_index": (
                    round(comparison[3], 4)
                    if comparison[3] is not None else None
                )
            },
            "scientific_note": (
                "MODIS and VIIRS activity indices are normalized "
                "within each sensor family and week. Correlation is "
                "calculated only for cell-weeks with detections from "
                "both sensor families. This measures similarity in "
                "relative spatial activity, not measurement equivalence "
                "or detection sensitivity. Differences in sensor "
                "resolution, observation coverage and detection "
                "characteristics remain. Both does not prove detection "
                "of the same fire. Counts are observations, not unique "
                "fires. Archive data only."
            )
        })

    except Exception:
        app.logger.exception("Harmonization analysis failed")
        return jsonify({
            "error": "Unable to calculate harmonized activity."
        }), 500

@app.route("/api/harmonization/download")
def harmonization_download():
    start_date = request.args.get("start", DEFAULT_START)
    end_date = request.args.get("end", DEFAULT_END)

    query = """
        WITH weekly AS (
            SELECT sensor_family,
                   (FLOOR(latitude / 0.25) + 0.5) * 0.25 AS grid_lat,
                   (FLOOR(longitude / 0.25) + 0.5) * 0.25 AS grid_lon,
                   DATE_TRUNC('week', acq_date)::DATE AS week,
                   COUNT(*) AS detections
            FROM observations
            WHERE data_stream = 'ARCHIVE'
              AND acq_date BETWEEN ? AND ?
            GROUP BY 1, 2, 3, 4
        ),
        totals AS (
            SELECT sensor_family, week, SUM(detections) AS total
            FROM weekly GROUP BY 1, 2
        ),
        norm AS (
            SELECT w.*, w.detections * 100000.0 / NULLIF(t.total, 0) AS idx
            FROM weekly w
            JOIN totals t ON w.sensor_family = t.sensor_family
                         AND w.week = t.week
        ),
        combined AS (
            SELECT grid_lat, grid_lon, week,
                   MAX(CASE WHEN sensor_family = 'MODIS' THEN detections ELSE 0 END) AS modis,
                   MAX(CASE WHEN sensor_family = 'VIIRS' THEN detections ELSE 0 END) AS viirs,
                   MAX(CASE WHEN sensor_family = 'MODIS' THEN idx END) AS modis_index,
                   MAX(CASE WHEN sensor_family = 'VIIRS' THEN idx END) AS viirs_index
            FROM norm GROUP BY 1, 2, 3
        )
        SELECT grid_lat, grid_lon, week, modis, viirs,
               ROUND(modis_index, 4), ROUND(viirs_index, 4),
               CASE WHEN modis > 0 AND viirs > 0 THEN 'BOTH'
                    WHEN modis > 0 THEN 'MODIS_ONLY'
                    ELSE 'VIIRS_ONLY' END
        FROM combined
        ORDER BY week, grid_lat, grid_lon
    """

    with duckdb.connect(str(DB_FILE), read_only=True) as con:
        rows = con.execute(query, [start_date, end_date]).fetchall()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "grid_lat", "grid_lon", "week_start",
        "modis_detections", "viirs_detections",
        "modis_activity_index", "viirs_activity_index",
        "agreement"
    ])
    writer.writerows(rows)

    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition":
                 "attachment; filename=firetrace_harmonized_weekly_grid.csv"}
    )

if __name__ == "__main__":
    if not DB_FILE.exists():
        raise FileNotFoundError(f"Database not found: {DB_FILE}")

    app.run(host="127.0.0.1", port=5000, debug=False)
