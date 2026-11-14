
const map = L.map("map").setView([30.5, 69.3], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 12
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
const persistenceLayer = L.layerGroup().addTo(map);
const concentrationLayer = L.layerGroup().addTo(map);

const elements = {
    start: document.getElementById("startDate"),
    end: document.getElementById("endDate"),
    sensor: document.getElementById("sensor"),
    satellite: document.getElementById("satellite"),
    stream: document.getElementById("stream"),

    total: document.getElementById("totalDetections"),
    cells: document.getElementById("gridCells"),
    activeSensor: document.getElementById("activeSensor"),
    activeStream: document.getElementById("activeStream"),

    status: document.getElementById("statusMessage"),
    apply: document.getElementById("applyFilters"),
    reset: document.getElementById("resetFilters"),

    calendar: document.getElementById("activityCalendar"),
    calendarStatus: document.getElementById("calendarStatus"),
    calendarMonths: document.getElementById("calendarMonths"),
    calendarTotal: document.getElementById("calendarTotal"),

    comparisonStream: document.getElementById("comparisonStream"),
    refreshComparison: document.getElementById("refreshComparison"),
    comparisonStatus: document.getElementById("comparisonStatus"),
    modisTotal: document.getElementById("modisTotal"),
    viirsTotal: document.getElementById("viirsTotal"),
    modisBar: document.getElementById("modisBar"),
    viirsBar: document.getElementById("viirsBar"),
    comparisonChart: document.getElementById("comparisonChart"),
    platformBreakdown: document.getElementById("platformBreakdown"),

    seasonalityChart: document.getElementById("seasonalityChart"),
    seasonalityStatus: document.getElementById("seasonalityStatus"),

    harmonizationSummary: document.getElementById("harmonizationSummary"),
    harmonizationStatus: document.getElementById("harmonizationStatus"),

    persistenceCells: document.getElementById("persistenceCells"),
    persistenceDetections: document.getElementById("persistenceDetections"),
    persistenceMaxMonths: document.getElementById("persistenceMaxMonths"),
    persistenceMaxYears: document.getElementById("persistenceMaxYears"),
    persistenceStatus: document.getElementById("persistenceStatus"),
    persistenceTable: document.getElementById("persistenceTableBody"),
    refreshPersistence: document.getElementById("refreshPersistence"),

    concentrationCells: document.getElementById("concentrationCells"),
    concentrationDetections: document.getElementById("concentrationDetections"),
    concentrationMaxDetections: document.getElementById("concentrationMaxDetections"),
    concentrationMaxDensity: document.getElementById("concentrationMaxDensity"),
    concentrationStatus: document.getElementById("concentrationStatus"),
    concentrationTable: document.getElementById("concentrationTableBody"),
    refreshConcentration: document.getElementById("refreshConcentration")
};

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-US");
}

function formatDecimal(value, places = 3) {
    return Number(value).toFixed(places);
}

function getColor(count, maximum) {
    const ratio = maximum > 0 ? count / maximum : 0;

    if (ratio >= 0.65) return "#ed493e";
    if (ratio >= 0.30) return "#ff9b50";

    return "#f8d477";
}

function getFilterParams() {
    return new URLSearchParams({
        sensor: elements.sensor.value,
        satellite: elements.satellite.value,
        stream: elements.stream.value
    });
}

function validDateRange() {
    const start = elements.start.value;
    const end = elements.end.value;

    if (!start || !end) {
        return "Please select both dates.";
    }

    if (start > end) {
        return "Start date cannot be after end date.";
    }

    return null;
}

// --------------------------------------------------
// MAP AND HOTSPOT OBSERVATIONS
// --------------------------------------------------

async function loadHotspots() {
    const dateError = validDateRange();

    if (dateError) {
        elements.status.textContent = dateError;
        return;
    }

    const params = getFilterParams();
    params.set("start", elements.start.value);
    params.set("end", elements.end.value);

    elements.status.textContent = "Loading satellite observations...";
    elements.apply.disabled = true;
    elements.apply.textContent = "Loading...";

    try {
        const response = await fetch(
            `/api/hotspots?${params.toString()}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Unable to load observations.");
        }

        markersLayer.clearLayers();

        const maximum = Math.max(
            1,
            ...result.data.map(item => Number(item.detections))
        );

        result.data.forEach(item => {
            const color = getColor(item.detections, maximum);
            const radius = 3 + (item.detections / maximum) * 13;

            const marker = L.circleMarker(
                [item.lat, item.lon],
                {
                    radius: radius,
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.72,
                    weight: 1
                }
            );

            marker.bindPopup(`
                <strong>Aggregated detection cell</strong><br>
                Latitude: ${item.lat}<br>
                Longitude: ${item.lon}<br>
                Detections: ${formatNumber(item.detections)}<br>
                Average FRP: ${
                    item.avg_frp === null
                        ? "Not available"
                        : Number(item.avg_frp).toFixed(2)
                }
            `);

            marker.addTo(markersLayer);
        });

        elements.total.textContent =
            formatNumber(result.total_detections);

        elements.cells.textContent =
            formatNumber(result.total_grid_cells);

        elements.activeSensor.textContent = result.filters.sensor;
        elements.activeStream.textContent = result.filters.stream;

        elements.status.textContent =
            `Showing ${formatNumber(result.total_detections)} detections across ${formatNumber(result.total_grid_cells)} grid cells.`;

    } catch (error) {
        console.error(error);
        elements.status.textContent = `Error: ${error.message}`;
    } finally {
        elements.apply.disabled = false;
        elements.apply.textContent = "Apply filters";
    }
}

// --------------------------------------------------
// HISTORICAL ACTIVITY CALENDAR
// --------------------------------------------------

function renderCalendar(data) {
    elements.calendar.innerHTML = "";

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const maximum = Math.max(
        1,
        ...data.map(item => Number(item.detections))
    );

    const lookup = new Map(
        data.map(item => [
            `${item.year}-${item.month}`,
            item.detections
        ])
    );

    const header = document.createElement("div");
    header.className = "calendar-row calendar-header";

    const empty = document.createElement("div");
    empty.textContent = "YEAR";
    header.appendChild(empty);

    months.forEach(month => {
        const cell = document.createElement("div");
        cell.textContent = month;
        header.appendChild(cell);
    });

    elements.calendar.appendChild(header);

    for (let year = 2000; year <= 2026; year++) {
        const row = document.createElement("div");
        row.className = "calendar-row";

        const yearLabel = document.createElement("div");
        yearLabel.className = "calendar-year";
        yearLabel.textContent = year;
        row.appendChild(yearLabel);

        months.forEach((month, index) => {
            const monthNumber = index + 1;
            const count = lookup.get(`${year}-${monthNumber}`) || 0;

            const cell = document.createElement("button");
            cell.className = "calendar-cell";
            cell.type = "button";

            const ratio = count / maximum;

            let level = 0;

            if (count > 0 && ratio >= 0.60) level = 4;
            else if (count > 0 && ratio >= 0.30) level = 3;
            else if (count > 0 && ratio >= 0.10) level = 2;
            else if (count > 0) level = 1;

            cell.classList.add(`level-${level}`);
            cell.title =
                `${month} ${year}: ${formatNumber(count)} detections`;

            cell.setAttribute(
                "aria-label",
                `${month} ${year}: ${count} detections`
            );

            cell.addEventListener("click", () => {
                const monthStart =
                    `${year}-${String(monthNumber).padStart(2, "0")}-01`;

                const lastDay = new Date(
                    year,
                    monthNumber,
                    0
                ).getDate();

                const monthEnd =
                    `${year}-${String(monthNumber).padStart(2, "0")}-${lastDay}`;

                elements.start.value = monthStart;
                elements.end.value = monthEnd;

                loadDashboard();

                document.getElementById("map").scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            });

            row.appendChild(cell);
        });

        elements.calendar.appendChild(row);
    }
}

async function loadCalendar() {
    elements.calendarStatus.textContent =
        "Calculating monthly detection activity...";

    try {
        const response = await fetch(
            `/api/calendar?${getFilterParams().toString()}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Calendar could not be loaded."
            );
        }

        renderCalendar(result.data);

        elements.calendarMonths.textContent =
            formatNumber(result.months_with_data);

        elements.calendarTotal.textContent =
            formatNumber(result.total_detections);

        elements.calendarStatus.textContent =
            "Historical monthly activity loaded. Select a month to explore its detections on the map.";

    } catch (error) {
        console.error(error);

        elements.calendarStatus.textContent =
            `Calendar error: ${error.message}`;
    }
}

// --------------------------------------------------
// MODIS VS VIIRS COMPARISON
// --------------------------------------------------

function renderComparisonChart(data) {
    const container = elements.comparisonChart;
    container.innerHTML = "";

    if (!data || data.length === 0) {
        container.textContent =
            "No comparison data is available for this period.";
        return;
    }

    const lookup = new Map();

    data.forEach(item => {
        const key =
            `${item.year}-${String(item.month).padStart(2, "0")}`;

        if (!lookup.has(key)) {
            lookup.set(key, {
                MODIS: null,
                VIIRS: null
            });
        }

        lookup.get(key)[item.sensor] = Number(item.detections);
    });

    const entries = Array.from(lookup.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));

    const width = 1000;
    const height = 300;
    const left = 65;
    const right = 20;
    const top = 25;
    const bottom = 45;

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const maximum = Math.max(
        1,
        ...entries.flatMap(entry => [
            entry[1].MODIS || 0,
            entry[1].VIIRS || 0
        ])
    );

    function getSensorPath(sensor, coverageStart) {
        let path = "";

        entries.forEach((entry, index) => {
            const monthKey = entry[0];
            const value = entry[1][sensor];

            if (monthKey < coverageStart) {
                return;
            }

            const count = value === null ? 0 : value;

            const x = left + (
                entries.length === 1
                    ? plotWidth / 2
                    : index / (entries.length - 1) * plotWidth
            );

            const y = top + plotHeight -
                (count / maximum) * plotHeight;

            path += path === ""
                ? `M ${x.toFixed(2)} ${y.toFixed(2)} `
                : `L ${x.toFixed(2)} ${y.toFixed(2)} `;
        });

        return path;
    }

    const modisPath = getSensorPath("MODIS", "2000-11");
    const viirsPath = getSensorPath("VIIRS", "2012-01");

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const y = top + plotHeight - ratio * plotHeight;
        const value = Math.round(maximum * ratio);

        return `
            <line x1="${left}" y1="${y}"
                  x2="${width - right}" y2="${y}"
                  stroke="rgba(150,180,205,0.2)"
                  stroke-width="1"/>

            <text x="${left - 10}" y="${y + 4}"
                  text-anchor="end"
                  fill="#8da1b7"
                  font-size="11">${formatNumber(value)}</text>
        `;
    }).join("");

    const labelIndexes = new Set([
        0,
        Math.floor((entries.length - 1) / 3),
        Math.floor((entries.length - 1) * 2 / 3),
        entries.length - 1
    ]);

    const dateLabels = entries.map((entry, index) => {
        if (!labelIndexes.has(index)) return "";

        const x = left + (
            entries.length === 1
                ? plotWidth / 2
                : index / (entries.length - 1) * plotWidth
        );

        return `
            <text x="${x}" y="${height - 12}"
                  text-anchor="middle"
                  fill="#8da1b7"
                  font-size="11">${entry[0]}</text>
        `;
    }).join("");

    container.innerHTML = `
        <div class="chart-legend">
            <span>
                <i class="chart-legend-dot modis-dot"></i>
                MODIS
            </span>
            <span>
                <i class="chart-legend-dot viirs-dot"></i>
                VIIRS
            </span>
        </div>

        <svg viewBox="0 0 ${width} ${height}"
             role="img"
             aria-label="Monthly MODIS and VIIRS detection trends"
             style="width:100%;height:auto;overflow:visible">

            ${gridLines}

            <path d="${modisPath}"
                  fill="none"
                  stroke="#59d9f2"
                  stroke-width="2.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"/>

            <path d="${viirsPath}"
                  fill="none"
                  stroke="#ff945b"
                  stroke-width="2.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"/>

            ${dateLabels}
        </svg>

        <p class="chart-note">
            Monthly observations. VIIRS coverage begins in 2012.
            Missing sensor coverage must not be interpreted as zero activity.
        </p>
    `;
}

function renderPlatformBreakdown(platforms) {
    const container = elements.platformBreakdown;
    container.innerHTML = "";

    if (!platforms || platforms.length === 0) {
        container.textContent = "No platform data available.";
        return;
    }

    const names = {
        AQUA: "Aqua",
        TERRA: "Terra",
        SNPP: "Suomi-NPP",
        N20: "NOAA-20",
        N21: "NOAA-21"
    };

    const maximum = Math.max(
        1,
        ...platforms.map(item => Number(item.detections))
    );

    platforms.forEach(item => {
        const row = document.createElement("div");
        row.className = "platform-row";

        const name = document.createElement("div");
        name.className = "platform-name";
        name.textContent =
            names[item.satellite.toUpperCase()] || item.satellite;

        const sensor = document.createElement("span");
        sensor.className = "platform-sensor";
        sensor.textContent = item.sensor;

        const count = document.createElement("strong");
        count.className = "platform-count";
        count.textContent = formatNumber(item.detections);

        const barTrack = document.createElement("div");
        barTrack.className = "platform-bar-track";

        const bar = document.createElement("div");

        bar.className = item.sensor === "MODIS"
            ? "platform-bar modis-platform-bar"
            : "platform-bar viirs-platform-bar";

        bar.style.width =
            `${(item.detections / maximum) * 100}%`;

        barTrack.appendChild(bar);

        const heading = document.createElement("div");
        heading.className = "platform-row-heading";
        heading.append(name, sensor, count);

        row.append(heading, barTrack);
        container.appendChild(row);
    });
}

async function loadComparison() {
    const dateError = validDateRange();

    if (dateError) {
        elements.comparisonStatus.textContent = dateError;
        return;
    }

    const params = new URLSearchParams({
        start: elements.start.value,
        end: elements.end.value,
        stream: elements.comparisonStream.value
    });

    elements.comparisonStatus.textContent =
        "Calculating MODIS and VIIRS comparison...";

    elements.refreshComparison.disabled = true;

    try {
        const response = await fetch(
            `/api/sensor-comparison?${params.toString()}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Unable to load sensor comparison."
            );
        }

        const modis = result.totals.MODIS || 0;
        const viirs = result.totals.VIIRS || 0;
        const maximum = Math.max(1, modis, viirs);

        elements.modisTotal.textContent = formatNumber(modis);
        elements.viirsTotal.textContent = formatNumber(viirs);

        elements.modisBar.style.width =
            `${(modis / maximum) * 100}%`;

        elements.viirsBar.style.width =
            `${(viirs / maximum) * 100}%`;

        renderComparisonChart(result.monthly);
        renderPlatformBreakdown(result.platforms);

        elements.comparisonStatus.textContent =
            `Comparison loaded for ${result.period.start} to ${result.period.end}. Data stream: ${result.data_stream}.`;

    } catch (error) {
        console.error(error);

        elements.comparisonStatus.textContent =
            `Comparison error: ${error.message}`;
    } finally {
        elements.refreshComparison.disabled = false;
    }
}

// --------------------------------------------------
// HOTSPOT PERSISTENCE ANALYSIS
// --------------------------------------------------

function highlightPersistenceCell(item) {
    persistenceLayer.clearLayers();

    const marker = L.circleMarker(
        [item.lat, item.lon],
        {
            radius: 13,
            color: "#ffffff",
            weight: 3,
            fillColor: "#ff945b",
            fillOpacity: 0.95
        }
    );

    marker.bindPopup(`
        <strong>Persistent detection grid cell</strong><br>
        Rank: ${item.rank}<br>
        Latitude: ${formatDecimal(item.lat)}<br>
        Longitude: ${formatDecimal(item.lon)}<br>
        Detections: ${formatNumber(item.detections)}<br>
        Active months: ${formatNumber(item.active_months)}<br>
        Active years: ${formatNumber(item.active_years)}<br>
        First detection: ${item.first_detection}<br>
        Latest detection: ${item.latest_detection}
    `);

    marker.addTo(persistenceLayer);
    marker.openPopup();

    map.setView([item.lat, item.lon], 7, {
        animate: true
    });

    document.getElementById("map").scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

function renderPersistenceTable(data) {
    elements.persistenceTable.innerHTML = "";

    if (!data || data.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 8;
        cell.textContent = "No persistence data found for these filters.";

        row.appendChild(cell);
        elements.persistenceTable.appendChild(row);
        return;
    }

    data.forEach(item => {
        const row = document.createElement("tr");
        row.className = "persistence-row";
        row.title = "Select to locate this grid cell on the map";

        const values = [
            item.rank,
            formatDecimal(item.lat),
            formatDecimal(item.lon),
            formatNumber(item.detections),
            formatNumber(item.active_months),
            formatNumber(item.active_years),
            item.first_detection,
            item.latest_detection
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;

            if (index === 0) {
                cell.className = "persistence-rank";
            }

            row.appendChild(cell);
        });

        row.addEventListener("click", () => {
            highlightPersistenceCell(item);
        });

        elements.persistenceTable.appendChild(row);
    });
}

async function loadPersistence() {
    const dateError = validDateRange();

    if (dateError) {
        elements.persistenceStatus.textContent = dateError;
        return;
    }

    const params = getFilterParams();

    params.set("start", elements.start.value);
    params.set("end", elements.end.value);
    params.set("limit", "20");

    elements.persistenceStatus.textContent =
        "Analyzing historical hotspot persistence...";

    elements.refreshPersistence.disabled = true;
    elements.refreshPersistence.textContent = "Analyzing...";

    try {
        const response = await fetch(
            `/api/persistence?${params.toString()}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Persistence analysis could not be loaded."
            );
        }

        const summary = result.summary;

        elements.persistenceCells.textContent =
            formatNumber(summary.total_grid_cells);

        elements.persistenceDetections.textContent =
            formatNumber(summary.total_detections);

        elements.persistenceMaxMonths.textContent =
            formatNumber(summary.maximum_active_months);

        elements.persistenceMaxYears.textContent =
            formatNumber(summary.maximum_active_years);

        renderPersistenceTable(result.data);

        elements.persistenceStatus.textContent =
            `Analysis complete. ${formatNumber(summary.total_grid_cells)} grid cells found across ${formatNumber(summary.total_detections)} observations. Showing ${formatNumber(result.returned_cells)} ranked cells.`;

    } catch (error) {
        console.error(error);

        elements.persistenceStatus.textContent =
            `Persistence error: ${error.message}`;

        elements.persistenceTable.innerHTML = `
            <tr>
                <td colspan="8">Unable to load persistence results.</td>
            </tr>
        `;
    } finally {
        elements.refreshPersistence.disabled = false;
        elements.refreshPersistence.textContent = "Refresh analysis";
    }
}

// --------------------------------------------------
// HOTSPOT CONCENTRATION ANALYSIS
// --------------------------------------------------

function highlightConcentrationCell(item) {
    concentrationLayer.clearLayers();

    const marker = L.circleMarker(
        [Number(item.lat), Number(item.lon)],
        {
            radius: 15,
            color: "#ffffff",
            weight: 3,
            fillColor: "#59d9f2",
            fillOpacity: 0.95
        }
    );

    marker.bindPopup(`
        <strong>Concentration grid cell</strong><br>
        Rank: ${item.rank}<br>
        Latitude: ${formatDecimal(item.lat)}<br>
        Longitude: ${formatDecimal(item.lon)}<br>
        Detections: ${formatNumber(item.detections)}<br>
        Cell area: ${formatNumber(Number(item.area_km2).toFixed(2))} km²<br>
        Detection density: ${Number(item.density_per_km2).toFixed(4)} per km²<br>
        Average FRP: ${
            item.avg_frp === null
                ? "Not available"
                : Number(item.avg_frp).toFixed(2)
        }<br>
        Maximum FRP: ${
            item.max_frp === null
                ? "Not available"
                : Number(item.max_frp).toFixed(2)
        }<br>
        First detection: ${item.first_detection}<br>
        Latest detection: ${item.latest_detection}
    `);

    marker.addTo(concentrationLayer);
    marker.openPopup();

    map.setView(
        [Number(item.lat), Number(item.lon)],
        7,
        { animate: true }
    );

    document.getElementById("map").scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

function renderConcentrationTable(data) {
    elements.concentrationTable.innerHTML = "";

    if (!data || data.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 8;
        cell.textContent =
            "No concentration data found for these filters.";

        row.appendChild(cell);
        elements.concentrationTable.appendChild(row);
        return;
    }

    data.forEach(item => {
        const row = document.createElement("tr");
        row.className = "persistence-row concentration-row";
        row.title = "Select to locate this grid cell on the map";

        const values = [
            item.rank,
            formatDecimal(item.lat),
            formatDecimal(item.lon),
            formatNumber(item.detections),
            formatNumber(Number(item.area_km2).toFixed(2)),
            Number(item.density_per_km2).toFixed(4),
            item.avg_frp === null
                ? "N/A"
                : Number(item.avg_frp).toFixed(2),
            item.max_frp === null
                ? "N/A"
                : Number(item.max_frp).toFixed(2)
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;

            if (index === 0) {
                cell.className = "persistence-rank";
            }

            row.appendChild(cell);
        });

        row.addEventListener("click", () => {
            highlightConcentrationCell(item);
        });

        elements.concentrationTable.appendChild(row);
    });
}

async function loadConcentration() {
    const dateError = validDateRange();

    if (dateError) {
        elements.concentrationStatus.textContent = dateError;
        return;
    }

    const params = getFilterParams();

    params.set("start", elements.start.value);
    params.set("end", elements.end.value);
    params.set("limit", "20");

    elements.concentrationStatus.textContent =
        "Calculating hotspot detection concentration...";

    elements.refreshConcentration.disabled = true;
    elements.refreshConcentration.textContent = "Analyzing...";

    try {
        const response = await fetch(
            `/api/concentration?${params.toString()}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Concentration analysis could not be loaded."
            );
        }

        const summary = result.summary;

        elements.concentrationCells.textContent =
            formatNumber(summary.total_grid_cells);

        elements.concentrationDetections.textContent =
            formatNumber(summary.total_detections);

        elements.concentrationMaxDetections.textContent =
            formatNumber(summary.maximum_cell_detections);

        elements.concentrationMaxDensity.textContent =
            Number(summary.maximum_cell_density_per_km2).toFixed(2);

        renderConcentrationTable(result.data);

        elements.concentrationStatus.textContent =
            `Analysis complete. ${formatNumber(summary.total_grid_cells)} occupied grid cells across ${formatNumber(summary.total_detections)} observations. Showing ${formatNumber(result.returned_cells)} ranked cells.`;

    } catch (error) {
        console.error(error);

        elements.concentrationStatus.textContent =
            `Concentration error: ${error.message}`;

        elements.concentrationTable.innerHTML = `
            <tr>
                <td colspan="8">Unable to load concentration results.</td>
            </tr>
        `;
    } finally {
        elements.refreshConcentration.disabled = false;
        elements.refreshConcentration.textContent = "Refresh analysis";
    }
}

// --------------------------------------------------
// HISTORICAL SEASONAL ACTIVITY
// --------------------------------------------------

function renderSeasonalityChart(data) {
    const container = elements.seasonalityChart;

    if (!container) return;

    container.innerHTML = "";

    if (!data || data.length === 0) {
        container.textContent = "No seasonal data available.";
        return;
    }

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const modis = Array(12).fill(0);
    const viirs = Array(12).fill(0);

    data.forEach(item => {
        const index = Number(item.month) - 1;

        if (index < 0 || index > 11) return;

        if (item.sensor_family === "MODIS") {
            modis[index] = Number(item.avg_monthly_share_pct);
        } else if (item.sensor_family === "VIIRS") {
            viirs[index] = Number(item.avg_monthly_share_pct);
        }
    });

    const width = 1000;
    const height = 350;
    const left = 65;
    const right = 25;
    const top = 35;
    const bottom = 55;

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maximum = Math.max(5, ...modis, ...viirs);
    const step = plotWidth / 12;
    const barWidth = step * 0.30;

    const grid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const y = top + plotHeight - ratio * plotHeight;
        const value = (maximum * ratio).toFixed(1);

        return `
            <line x1="${left}" y1="${y}"
                  x2="${width - right}" y2="${y}"
                  stroke="rgba(150,180,205,0.2)"/>

            <text x="${left - 10}" y="${y + 4}"
                  text-anchor="end"
                  fill="#8da1b7"
                  font-size="12">${value}%</text>
        `;
    }).join("");

    const bars = months.map((month, index) => {
        const center = left + step * (index + 0.5);

        const modisHeight =
            (modis[index] / maximum) * plotHeight;

        const viirsHeight =
            (viirs[index] / maximum) * plotHeight;

        const modisY = top + plotHeight - modisHeight;
        const viirsY = top + plotHeight - viirsHeight;

        return `
            <rect x="${center - barWidth - 2}"
                  y="${modisY}"
                  width="${barWidth}"
                  height="${modisHeight}"
                  rx="3"
                  fill="#59d9f2">
                <title>MODIS ${month}: ${modis[index].toFixed(2)}%</title>
            </rect>

            <rect x="${center + 2}"
                  y="${viirsY}"
                  width="${barWidth}"
                  height="${viirsHeight}"
                  rx="3"
                  fill="#ff945b">
                <title>VIIRS ${month}: ${viirs[index].toFixed(2)}%</title>
            </rect>

            <text x="${center}" y="${height - 20}"
                  text-anchor="middle"
                  fill="#8da1b7"
                  font-size="12">${month}</text>
        `;
    }).join("");

    container.innerHTML = `
        <div class="chart-legend">
            <span><i class="chart-legend-dot modis-dot"></i> MODIS</span>
            <span><i class="chart-legend-dot viirs-dot"></i> VIIRS</span>
        </div>

        <svg viewBox="0 0 ${width} ${height}"
             role="img"
             aria-label="Historical monthly seasonal activity by sensor"
             style="width:100%;height:auto;overflow:visible">

            ${grid}
            ${bars}
        </svg>
    `;
}

async function loadSeasonality() {
    try {
        if (!elements.seasonalityChart) return;

        elements.seasonalityStatus.textContent =
            "Loading historical seasonal analysis...";

        const response = await fetch("/api/seasonality");

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        renderSeasonalityChart(result.historical_data);

        elements.seasonalityStatus.textContent =
            "Historical archive analysis loaded. MODIS: 2001–2025 (25 years). VIIRS: 2012–2025 (14 years). Partial years and near-real-time observations excluded.";

    } catch (error) {
        console.error("Seasonality error:", error);

        elements.seasonalityStatus.textContent =
            `Seasonality error: ${error.message}`;
    }
}

async function loadHarmonization() {
    try {
        const response = await fetch("/api/harmonization");
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        const summary = data.summary;
        const comparison = data.normalized_comparison;

        const labels = [
            ["BOTH", "Both sensors"],
            ["MODIS_ONLY", "MODIS only"],
            ["VIIRS_ONLY", "VIIRS only"]
        ];

        const agreementCards = labels.map(([key, label]) => `
            <div class="comparison-card">
                <span class="comparison-label">${label}</span>
                <strong>${summary[key].cell_weeks.toLocaleString()}</strong>
                <small>${summary[key].unique_cells.toLocaleString()} distinct grid cells</small>
            </div>
        `).join("");

        elements.harmonizationSummary.innerHTML = `
            ${agreementCards}
            <div class="comparison-card">
                <span class="comparison-label">Shared-cell correlation</span>
                <strong>${comparison.pearson_correlation ?? "N/A"}</strong>
                <small>Pearson correlation of normalized activity</small>
            </div>
            <div class="comparison-card">
                <span class="comparison-label">MODIS normalized index</span>
                <strong>${comparison.mean_modis_index.toLocaleString()}</strong>
                <small>Mean across shared active cell-weeks</small>
            </div>
            <div class="comparison-card">
                <span class="comparison-label">VIIRS normalized index</span>
                <strong>${comparison.mean_viirs_index.toLocaleString()}</strong>
                <small>Mean across shared active cell-weeks</small>
            </div>
        `;

        elements.harmonizationStatus.textContent =
            "Indices represent each sensor's share of weekly detections per 100,000 detections. Correlation measures relative spatial activity, not equal sensor sensitivity or detection of the same fire.";

    } catch (error) {
        elements.harmonizationStatus.textContent =
            "Unable to load cross-sensor analysis.";
        console.error(error);
    }
}

function loadCaseStudyChart() {
    const container = document.getElementById("caseStudyChart");

    if (!container) return;

    const monthlyData = [
        { month: "Jan", modis: 524, viirs: 2097 },
        { month: "Feb", modis: 522, viirs: 2023 },
        { month: "Mar", modis: 163, viirs: 1489 },
        { month: "Apr", modis: 56, viirs: 1154 },
        { month: "May", modis: 8, viirs: 894 },
        { month: "Jun", modis: 4, viirs: 748 },
        { month: "Jul", modis: 7, viirs: 426 },
        { month: "Aug", modis: 11, viirs: 455 },
        { month: "Sep", modis: 9, viirs: 777 },
        { month: "Oct", modis: 8, viirs: 1198 },
        { month: "Nov", modis: 75, viirs: 1617 },
        { month: "Dec", modis: 291, viirs: 1884 }
    ];

    const maximum = 2097;

    const rows = monthlyData.map(item => `
        <div style="display:grid;grid-template-columns:35px 1fr;gap:10px;align-items:center;margin:12px 0;">
            <strong>${item.month}</strong>

            <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <div style="height:12px;width:${item.modis / maximum * 100}%;min-width:2px;background:#3986c8;border-radius:3px;"></div>
                    <small>${item.modis.toLocaleString()}</small>
                </div>

                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="height:12px;width:${item.viirs / maximum * 100}%;min-width:2px;background:#d58b36;border-radius:3px;"></div>
                    <small>${item.viirs.toLocaleString()}</small>
                </div>
            </div>
        </div>
    `).join("");

    container.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;">
            <span><span style="display:inline-block;width:11px;height:11px;background:#3986c8;border-radius:2px;"></span> MODIS</span>
            <span><span style="display:inline-block;width:11px;height:11px;background:#d58b36;border-radius:2px;"></span> VIIRS</span>
        </div>
        ${rows}
        <p class="status-message">
            Bar lengths share one scale. Values are raw detection counts,
            not normalized sensor measurements.
        </p>
    `;
}

// --------------------------------------------------
// DASHBOARD CONTROLS
// --------------------------------------------------

async function loadDashboard() {
    await Promise.all([
        loadHotspots(),
        loadCalendar(),
        loadComparison(),
        loadSeasonality(),
        loadCaseStudyChart(),
        loadHarmonization(),
        loadPersistence(),
        loadConcentration()
    ]);
}

function resetFilters() {
    elements.start.value = "2000-11-01";
    elements.end.value = "2026-11-12";
    elements.sensor.value = "ALL";
    elements.satellite.value = "ALL";
    elements.stream.value = "ALL";
    elements.comparisonStream.value = "ALL";

    persistenceLayer.clearLayers();
    concentrationLayer.clearLayers();

    loadDashboard();
}

elements.apply.addEventListener("click", () => {
    elements.comparisonStream.value = elements.stream.value;

    persistenceLayer.clearLayers();
    concentrationLayer.clearLayers();

    loadDashboard();
});

elements.reset.addEventListener("click", resetFilters);

elements.refreshComparison.addEventListener(
    "click",
    loadComparison
);

elements.comparisonStream.addEventListener(
    "change",
    loadComparison
);

elements.refreshPersistence.addEventListener(
    "click",
    loadPersistence
);

elements.refreshConcentration.addEventListener(
    "click",
    loadConcentration
);

// Initial dashboard load
loadDashboard();
