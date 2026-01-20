import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";

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

type DataVisualization = "cluster" | "heatmap" | "points" | "hexagon";

interface ColorScheme {
  primary: string;
  secondary: string;
  tertiary: string;
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const asiaDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
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
  const [showAddData, setShowAddData] = useState(false);
  const [userFeatures, setUserFeatures] = useState<GeoJSON.Feature[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapRef.current!,
      style: MAP_STYLES[currentStyle],
      center: [100, 30],
      zoom: 3,
      projection: "mercator",
    });

    mapInstanceRef.current = map;

    map.on("load", async () => {
      // Fetch và filter data cho châu Á
      const response = await fetch("/points.geojson");
      const data = await response.json();

      // Filter chỉ giữ các điểm ở châu Á (longitude: 25-180, latitude: -10-55)
      const asiaData = {
        ...data,
        features: data.features.filter((feature: unknown) => {
          const f = feature as GeoJSON.Feature;
          if (f.type !== "Feature" || f.geometry?.type !== "Point")
            return false;
          const [lng, lat] = f.geometry.coordinates as [number, number];
          return lng >= 25 && lng <= 180 && lat >= -10 && lat <= 55;
        }),
      };

      asiaDataRef.current = asiaData;

      map.addSource("points", {
        type: "geojson",
        data: asiaData,
        cluster: dataViz === "cluster",
        clusterRadius: 45,
        clusterMaxZoom: 5,
      });

      // Add layers based on visualization type
      addVisualizationLayers(map, dataViz, colorScheme);
    });

    return () => map.remove();
  }, [currentStyle, dataViz, colorScheme]);

  useEffect(() => {
    if (mapInstanceRef.current && asiaDataRef.current) {
      const newData = {
        ...asiaDataRef.current,
        features: [...asiaDataRef.current.features, ...userFeatures],
      };
      (
        mapInstanceRef.current.getSource("points") as mapboxgl.GeoJSONSource
      )?.setData(newData);
    }
  }, [userFeatures]);

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
      "points-layer",
      "hexagon-layer",
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
            colors.tertiary + "40",
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
    } else if (vizType === "points") {
      // All points without clustering
      map.addLayer({
        id: "points-layer",
        type: "circle",
        source: "points",
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            colors.tertiary + "60",
            2,
            colors.tertiary,
            3,
            colors.secondary,
            4,
            colors.primary,
            5,
            colors.primary,
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            4,
            5,
            12,
          ],
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });
    } else if (vizType === "hexagon") {
      // Hexagon grid visualization (simplified as circles with density)
      map.addLayer({
        id: "hexagon-layer",
        type: "circle",
        source: "points",
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            colors.tertiary + "80",
            2,
            colors.tertiary,
            3,
            colors.secondary,
            4,
            colors.primary,
            5,
            colors.primary,
          ],
          "circle-radius": 8,
          "circle-opacity": 0.6,
          "circle-stroke-width": 1,
          "circle-stroke-color": colors.primary,
        },
      });
    }
  };

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      alert("Please select a JSON file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        let features: GeoJSON.Feature[] = [];

        if (data.type === "FeatureCollection" && data.features) {
          features = data.features.filter((f: unknown) => {
            const feature = f as GeoJSON.Feature;
            return (
              feature.type === "Feature" && feature.geometry?.type === "Point"
            );
          });
        } else if (Array.isArray(data)) {
          features = data.filter((f: unknown) => {
            const feature = f as GeoJSON.Feature;
            return (
              feature.type === "Feature" && feature.geometry?.type === "Point"
            );
          });
        } else {
          throw new Error(
            "Invalid JSON format. Expected FeatureCollection or array of Features.",
          );
        }

        if (features.length === 0) {
          alert("No valid Point features found in the file");
          return;
        }

        setUserFeatures((prev) => [...prev, ...features]);
        setUploadedFileName(file.name);
        alert(`Added ${features.length} points from ${file.name}`);
      } catch (error) {
        alert("Error parsing JSON file: " + (error as Error).message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div ref={mapRef} style={{ width: "100vw", height: "100vh" }} />

      {/* Toggle Buttons */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "8px",
          zIndex: 1001,
        }}
      >
        <button
          onClick={() => setShowMapStyle(!showMapStyle)}
          style={{
            padding: "8px 12px",
            background: showMapStyle
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            transition: "all 0.2s",
          }}
          title="Toggle Map Style Panel"
        >
          🗺️ Map Style
        </button>
        <button
          onClick={() => setShowDataViz(!showDataViz)}
          style={{
            padding: "8px 12px",
            background: showDataViz
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            transition: "all 0.2s",
          }}
          title="Toggle Data Visualization Panel"
        >
          📊 Visualization
        </button>
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          style={{
            padding: "8px 12px",
            background: showColorPicker
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            transition: "all 0.2s",
          }}
          title="Toggle Color Picker Panel"
        >
          🎨 Colors
        </button>
        <button
          onClick={() => setShowAddData(!showAddData)}
          style={{
            padding: "8px 12px",
            background: showAddData
              ? "rgba(255, 59, 48, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            transition: "all 0.2s",
          }}
          title="Toggle Add Data Panel"
        >
          ➕ Add Data
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
          {(
            ["cluster", "heatmap", "points", "hexagon"] as DataVisualization[]
          ).map((viz) => (
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

      {/* Add Data Panel */}
      {showAddData && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            background: "rgba(0, 0, 0, 0.8)",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            zIndex: 1000,
            maxWidth: "300px",
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
            Upload JSON File
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              style={{
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #444",
                background: "#2a2a2a",
                color: "#fff",
                fontSize: "12px",
              }}
            />
            <div style={{ color: "#aaa", fontSize: "11px" }}>
              Upload a GeoJSON FeatureCollection or array of Point features
            </div>
            <div style={{ color: "#aaa", fontSize: "11px" }}>
              <a
                href="/template.json"
                download="template.json"
                style={{ color: "#ff9500", textDecoration: "underline" }}
              >
                Download template file
              </a>
            </div>
          </div>
          {userFeatures.length > 0 && (
            <div style={{ borderTop: "1px solid #444", paddingTop: "8px" }}>
              <div
                style={{ color: "#fff", fontSize: "12px", marginBottom: "4px" }}
              >
                Added Points: {userFeatures.length}
                {uploadedFileName && ` from ${uploadedFileName}`}
              </div>
              <button
                onClick={() => {
                  setUserFeatures([]);
                  setUploadedFileName("");
                }}
                style={{
                  padding: "4px 8px",
                  background: "#444",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "10px",
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
