import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { Map, BarChart3, Palette, LogOut } from "lucide-react";
import { ApiService } from "../services/api";
import type { DeviceLocation } from "../types/auth";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-v9",
  satelliteStreets: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
} as const;

type MapStyle = keyof typeof MAP_STYLES;

type DataVisualization = "cluster" | "heatmap";

interface ColorScheme {
  primary: string;
  secondary: string;
  tertiary: string;
}

// Convert hex color to rgba with alpha
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Convert DeviceLocation array to GeoJSON FeatureCollection
function deviceLocationsToGeoJSON(
  locations: DeviceLocation[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((loc, index) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: loc,
      },
      properties: {
        id: index,
        weight: 1,
      },
    })),
  };
}

interface MapViewProps {
  onLogout: () => void;
}

export default function MapView({ onLogout }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const deviceDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const allLocationsRef = useRef<DeviceLocation[]>([]);
  const [currentStyle, setCurrentStyle] = useState<MapStyle>("dark");
  const [dataViz, setDataViz] = useState<DataVisualization>("cluster");
  const [colorScheme, setColorScheme] = useState<ColorScheme>({
    primary: "#ff3b30",
    secondary: "#ff9500",
    tertiary: "#ffcc00",
  });
  const [showMapStyle, setShowMapStyle] = useState(true);
  const [showDataViz, setShowDataViz] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);

  // Filter locations within map bounds
  const filterLocationsByBounds = (
    locations: DeviceLocation[],
    bounds: mapboxgl.LngLatBounds,
  ) => {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    return locations.filter(([lng, lat]) => {
      return lng >= sw.lng && lng <= ne.lng && lat >= sw.lat && lat <= ne.lat;
    });
  };

  // Update visible data based on map bounds
  const updateVisibleData = (map: mapboxgl.Map) => {
    const bounds = map.getBounds();
    const visibleLocations = filterLocationsByBounds(
      allLocationsRef.current,
      bounds,
    );
    const geoJSONData = deviceLocationsToGeoJSON(visibleLocations);

    deviceDataRef.current = geoJSONData;
    setVisibleCount(visibleLocations.length);

    const source = map.getSource("points") as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(geoJSONData);
    }
  };

  const addVisualizationLayers = (
    map: mapboxgl.Map,
    vizType: DataVisualization,
    colors: ColorScheme,
  ) => {
    // Remove existing layers if they exist
    const layersToRemove = [
      "clusters",
      "cluster-count",
      "unclustered-point",
      "heatmap-layer",
    ];
    layersToRemove.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    if (vizType === "cluster") {
      // Cluster
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "points",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": colors.primary,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            12,
            50,
            18,
            200,
            26,
          ],
          "circle-opacity": 0.85,
        },
      });

      // Cluster count
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "points",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#fff",
        },
      });

      // Single points
      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "points",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": colors.primary,
          "circle-radius": 4,
          "circle-opacity": 0.8,
        },
      });
    } else if (vizType === "heatmap") {
      // Heatmap
      map.addLayer({
        id: "heatmap-layer",
        type: "heatmap",
        source: "points",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            6,
            1,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            1,
            9,
            3,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.2,
            hexToRgba(colors.tertiary, 0.25),
            0.4,
            colors.tertiary,
            0.6,
            colors.secondary,
            0.8,
            colors.primary,
            1,
            colors.primary,
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 9, 20],
          "heatmap-opacity": 0.8,
        },
      });
    }
  };
  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapRef.current!,
      style: MAP_STYLES[currentStyle],
      center: [106.83, 10.84],
      zoom: 3,
      projection: "mercator",
    });

    mapInstanceRef.current = map;

    map.on("load", async () => {
      try {
        // Fetch device locations từ API
        const locations = await ApiService.getDeviceLocations();
        allLocationsRef.current = locations;

        // Filter by initial viewport
        const bounds = map.getBounds();
        const visibleLocations = filterLocationsByBounds(locations, bounds);
        const geoJSONData = deviceLocationsToGeoJSON(visibleLocations);

        deviceDataRef.current = geoJSONData;
        setVisibleCount(visibleLocations.length);

        map.addSource("points", {
          type: "geojson",
          data: geoJSONData,
          cluster: dataViz === "cluster",
          clusterRadius: 45,
          clusterMaxZoom: 5,
        });

        // Add layers based on visualization type
        addVisualizationLayers(map, dataViz, colorScheme);
        setLoading(false);

        // Update data when map moves or zooms
        map.on("moveend", () => updateVisibleData(map));
        map.on("zoomend", () => updateVisibleData(map));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
        if (err instanceof Error && err.message === "Unauthorized") {
          onLogout();
        }
      }
    });

    return () => map.remove();
  }, [currentStyle, dataViz, colorScheme, onLogout]);

  const handleStyleChange = (style: MapStyle) => {
    setCurrentStyle(style);
  };

  const handleDataVizChange = (viz: DataVisualization) => {
    setDataViz(viz);
  };

  const handleColorChange = (colorType: keyof ColorScheme, value: string) => {
    setColorScheme((prev) => ({
      ...prev,
      [colorType]: value,
    }));
  };

  return (
    <>
      <div ref={mapRef} style={{ width: "100vw", height: "100vh" }} />

      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0, 0, 0, 0.8)",
            color: "#fff",
            padding: "20px 40px",
            borderRadius: "8px",
            zIndex: 2000,
          }}
        >
          Loading device locations...
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(255, 0, 0, 0.9)",
            color: "#fff",
            padding: "20px 40px",
            borderRadius: "8px",
            zIndex: 2000,
          }}
        >
          {error}
        </div>
      )}

      {/* Data Count Badge */}
      {!loading && !error && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            background: "rgba(0, 0, 0, 0.8)",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "11px",
            fontWeight: "bold",
            zIndex: 1000,
            border: "2px solid rgba(255, 255, 255, 0.3)",
          }}
        >
          📍 {visibleCount.toLocaleString()} /{" "}
          {allLocationsRef.current.length.toLocaleString()} locations
        </div>
      )}

      {/* Toggle Buttons */}
      <div
        style={{
          position: "absolute",
          top: "15px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "6px",
          zIndex: 1001,
        }}
      >
        <button
          onClick={() => setShowMapStyle(!showMapStyle)}
          style={{
            padding: "6px 10px",
            background: showMapStyle
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: "bold",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
          }}
          title="Toggle Map Style Panel"
        >
          <Map size={14} style={{ marginRight: "4px" }} />
          Map Style
        </button>
        <button
          onClick={() => setShowDataViz(!showDataViz)}
          style={{
            padding: "6px 10px",
            background: showDataViz
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: "bold",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
          }}
          title="Toggle Data Visualization Panel"
        >
          <BarChart3 size={14} style={{ marginRight: "4px" }} />
          Visualization
        </button>
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          style={{
            padding: "6px 10px",
            background: showColorPicker
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: "bold",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
          }}
          title="Toggle Color Picker Panel"
        >
          <Palette size={14} style={{ marginRight: "4px" }} />
          Colors
        </button>
        {/* Logout Button */}
        <button
          onClick={onLogout}
          style={{
            padding: "6px 10px",
            background: "rgba(255, 59, 48, 0.9)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
          }}
        >
          <LogOut size={14} style={{ marginRight: "4px" }} />
          Logout
        </button>
      </div>

      {/* Map Style Panel */}
      {showMapStyle && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "rgba(0, 0, 0, 0.8)",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Map Style
          </div>
          {(Object.keys(MAP_STYLES) as MapStyle[]).map((style) => (
            <button
              key={style}
              onClick={() => handleStyleChange(style)}
              style={{
                padding: "8px 16px",
                background: currentStyle === style ? "#ff3b30" : "#2a2a2a",
                color: "#fff",
                border:
                  currentStyle === style
                    ? "2px solid #ff3b30"
                    : "2px solid #444",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: currentStyle === style ? "bold" : "normal",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (currentStyle !== style) {
                  e.currentTarget.style.background = "#3a3a3a";
                }
              }}
              onMouseLeave={(e) => {
                if (currentStyle !== style) {
                  e.currentTarget.style.background = "#2a2a2a";
                }
              }}
            >
              {style === "satelliteStreets"
                ? "Satellite Streets"
                : style.charAt(0).toUpperCase() + style.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Data Visualization Panel */}
      {showDataViz && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            background: "rgba(0, 0, 0, 0.8)",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Data Visualization
          </div>
          {(["cluster", "heatmap"] as DataVisualization[]).map((viz) => (
            <button
              key={viz}
              onClick={() => handleDataVizChange(viz)}
              style={{
                padding: "8px 16px",
                background: dataViz === viz ? "#ff3b30" : "#2a2a2a",
                color: "#fff",
                border:
                  dataViz === viz ? "2px solid #ff3b30" : "2px solid #444",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: dataViz === viz ? "bold" : "normal",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (dataViz !== viz) {
                  e.currentTarget.style.background = "#3a3a3a";
                }
              }}
              onMouseLeave={(e) => {
                if (dataViz !== viz) {
                  e.currentTarget.style.background = "#2a2a2a";
                }
              }}
            >
              {viz.charAt(0).toUpperCase() + viz.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Color Picker Panel */}
      {showColorPicker && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
            background: "rgba(0, 0, 0, 0.8)",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Color Scheme
          </div>

          {/* Primary Color */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label
              style={{
                color: "#fff",
                fontSize: "12px",
                minWidth: "70px",
              }}
            >
              Primary:
            </label>
            <input
              type="color"
              value={colorScheme.primary}
              onChange={(e) => handleColorChange("primary", e.target.value)}
              style={{
                width: "50px",
                height: "30px",
                border: "2px solid #444",
                borderRadius: "4px",
                cursor: "pointer",
                background: "transparent",
              }}
            />
            <span
              style={{
                color: "#aaa",
                fontSize: "11px",
                fontFamily: "monospace",
              }}
            >
              {colorScheme.primary}
            </span>
          </div>

          {/* Secondary Color */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label
              style={{
                color: "#fff",
                fontSize: "12px",
                minWidth: "70px",
              }}
            >
              Secondary:
            </label>
            <input
              type="color"
              value={colorScheme.secondary}
              onChange={(e) => handleColorChange("secondary", e.target.value)}
              style={{
                width: "50px",
                height: "30px",
                border: "2px solid #444",
                borderRadius: "4px",
                cursor: "pointer",
                background: "transparent",
              }}
            />
            <span
              style={{
                color: "#aaa",
                fontSize: "11px",
                fontFamily: "monospace",
              }}
            >
              {colorScheme.secondary}
            </span>
          </div>

          {/* Tertiary Color */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label
              style={{
                color: "#fff",
                fontSize: "12px",
                minWidth: "70px",
              }}
            >
              Tertiary:
            </label>
            <input
              type="color"
              value={colorScheme.tertiary}
              onChange={(e) => handleColorChange("tertiary", e.target.value)}
              style={{
                width: "50px",
                height: "30px",
                border: "2px solid #444",
                borderRadius: "4px",
                cursor: "pointer",
                background: "transparent",
              }}
            />
            <span
              style={{
                color: "#aaa",
                fontSize: "11px",
                fontFamily: "monospace",
              }}
            >
              {colorScheme.tertiary}
            </span>
          </div>

          {/* Preset Colors */}
          <div
            style={{
              borderTop: "1px solid #444",
              paddingTop: "8px",
              marginTop: "4px",
            }}
          >
            <div
              style={{ color: "#fff", fontSize: "12px", marginBottom: "8px" }}
            >
              Presets:
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() =>
                  setColorScheme({
                    primary: "#ff3b30",
                    secondary: "#ff9500",
                    tertiary: "#ffcc00",
                  })
                }
                style={{
                  padding: "6px 10px",
                  background:
                    "linear-gradient(135deg, #ff3b30, #ff9500, #ffcc00)",
                  border: "2px solid #444",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: "#fff",
                  fontWeight: "bold",
                }}
                title="Red-Orange-Yellow"
              >
                Hot
              </button>
              <button
                onClick={() =>
                  setColorScheme({
                    primary: "#007aff",
                    secondary: "#5ac8fa",
                    tertiary: "#a0d9ff",
                  })
                }
                style={{
                  padding: "6px 10px",
                  background:
                    "linear-gradient(135deg, #007aff, #5ac8fa, #a0d9ff)",
                  border: "2px solid #444",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: "#fff",
                  fontWeight: "bold",
                }}
                title="Blue gradient"
              >
                Cool
              </button>
              <button
                onClick={() =>
                  setColorScheme({
                    primary: "#34c759",
                    secondary: "#30d158",
                    tertiary: "#a8f5ba",
                  })
                }
                style={{
                  padding: "6px 10px",
                  background:
                    "linear-gradient(135deg, #34c759, #30d158, #a8f5ba)",
                  border: "2px solid #444",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: "#fff",
                  fontWeight: "bold",
                }}
                title="Green gradient"
              >
                Green
              </button>
              <button
                onClick={() =>
                  setColorScheme({
                    primary: "#af52de",
                    secondary: "#bf5af2",
                    tertiary: "#e5b3ff",
                  })
                }
                style={{
                  padding: "6px 10px",
                  background:
                    "linear-gradient(135deg, #af52de, #bf5af2, #e5b3ff)",
                  border: "2px solid #444",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: "#fff",
                  fontWeight: "bold",
                }}
                title="Purple gradient"
              >
                Purple
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
