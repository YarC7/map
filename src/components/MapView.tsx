import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { Map, Palette, LogOut, Settings, BarChart3 } from "lucide-react";
import { ApiService } from "../services/api";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const MVT_TILES_URL = `${API_BASE_URL}/tiles/{z}/{x}/{y}.mvt`;

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-v9",
  satelliteStreets: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
} as const;

type MapStyle = keyof typeof MAP_STYLES;

interface ColorScheme {
  primary: string;
  secondary: string;
  tertiary: string;
}

interface MapViewProps {
  onLogout: () => void;
}

export default function MapView({ onLogout }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const [currentStyle, setCurrentStyle] = useState<MapStyle>("streets");
  const [colorScheme, setColorScheme] = useState<ColorScheme>({
    primary: "#ff3b30",
    secondary: "#ff9500",
    tertiary: "#ffcc00",
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showDataViz, setShowDataViz] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMenuHovered, setIsMenuHovered] = useState(false);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);

  const addMVTLayers = (
    map: mapboxgl.Map,
    colors: ColorScheme,
    showHeatmap: boolean
  ) => {
    // Remove existing layers
    const layersToRemove = [
      "mvt-clusters",
      "mvt-cluster-count",
      "mvt-points",
      "mvt-heatmap",
    ];
    layersToRemove.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    if (showHeatmap) {
      // Heatmap layer for high-density data visualization
      map.addLayer({
        id: "mvt-heatmap",
        type: "heatmap",
        source: "mvt-points",
        "source-layer": "devices",
        maxzoom: 15,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "weight"], ["get", "point_count"], 1],
            0,
            0,
            1,
            0.5,
            10,
            1,
            100,
            2
          ],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 2, 5, 3, 9, 4],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.15,
            colors.tertiary,
            0.35,
            colors.secondary,
            0.6,
            colors.primary,
            1.0,
            colors.primary,
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 5, 16, 9, 25, 15, 50],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 15, 0],
        },
      });

      // Also add small points on top of heatmap at high zoom
      map.addLayer({
        id: "mvt-points",
        type: "circle",
        source: "mvt-points",
        "source-layer": "devices",
        minzoom: 8,
        paint: {
          "circle-color": colors.primary,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1, 12, 3],
          "circle-stroke-width": 0,
          "circle-stroke-color": "transparent",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 11, 0.4, 14, 0.8],
        },
      });
    } else {
      // Cluster circles
      map.addLayer({
        id: "mvt-clusters",
        type: "circle",
        source: "mvt-points",
        "source-layer": "devices",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            colors.tertiary,
            10,
            colors.secondary,
            50,
            colors.primary,
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            10,
            20,
            50,
            25,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      // Cluster count labels
      map.addLayer({
        id: "mvt-cluster-count",
        type: "symbol",
        source: "mvt-points",
        "source-layer": "devices",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#fff",
        },
      });

      // Individual points
      map.addLayer({
        id: "mvt-points",
        type: "circle",
        source: "mvt-points",
        "source-layer": "devices",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": colors.primary,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
    }
  };

  const currentStyleRef = useRef<MapStyle>(currentStyle);

  useEffect(() => {
    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;

      const updateLayers = () => {
        if (!map.getSource("mvt-points")) {
          map.addSource("mvt-points", {
            type: "vector",
            tiles: [MVT_TILES_URL],
            minzoom: 0,
            maxzoom: 14,
          });
        }
        addMVTLayers(map, colorScheme, showDataViz);
      };

      if (currentStyleRef.current !== currentStyle) {
        currentStyleRef.current = currentStyle;
        map.setStyle(MAP_STYLES[currentStyle]);
        map.once("style.load", updateLayers);
      } else if (map.isStyleLoaded()) {
        updateLayers();
      }
      return;
    }

    const map = new mapboxgl.Map({
      container: mapRef.current!,
      style: MAP_STYLES[currentStyle],
      center: [106.83, 10.84],
      zoom: 3,
      projection: "mercator",
      transformRequest: (url, resourceType) => {
        if (resourceType === "Tile" && url.includes("/tiles/")) {
          const token = ApiService.getAccessToken();
          return {
            url,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          } as mapboxgl.RequestParameters;
        }
        return { url } as mapboxgl.RequestParameters;
      },
    });

    mapInstanceRef.current = map;

    map.on("load", () => {
      try {
        if (!map.getSource("mvt-points")) {
          map.addSource("mvt-points", {
            type: "vector",
            tiles: [MVT_TILES_URL],
            minzoom: 0,
            maxzoom: 14,
          });
        }
        addMVTLayers(map, colorScheme, showDataViz);

        // Click handler for points
        map.on("click", "mvt-points", (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const coords = (feature.geometry as GeoJSON.Point).coordinates.slice();
            const props = feature.properties || {};

            new mapboxgl.Popup({ className: "device-popup" })
              .setLngLat(coords as [number, number])
              .setHTML(`
                <div style="padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  <div style="font-weight: 700; font-size: 14px; color: #1a1a1a; margin-bottom: 8px; border-bottom: 2px solid #ff3b30; padding-bottom: 6px;">
                    Device Info
                  </div>
                  ${props.name ? `<div style="margin-bottom: 4px;"><span style="color: #666; font-size: 12px;">Name:</span><br/><span style="color: #1a1a1a; font-weight: 500;">${props.name}</span></div>` : ""}
                  ${props.deviceType ? `<div style="margin-bottom: 4px;"><span style="color: #666; font-size: 12px;">Type:</span><br/><span style="color: #1a1a1a; font-weight: 500; text-transform: capitalize;">${props.deviceType}</span></div>` : ""}
                  <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #888;">
                    📍 ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}
                  </div>
                </div>
              `)
              .addTo(map);
          }
        });

        // Event for cursor on hover
        map.on("mouseenter", "mvt-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "mvt-points", () => {
          map.getCanvas().style.cursor = "";
        });

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load map");
        setLoading(false);
      }
    });

    return () => {
      // Keep map instance alive
    };
  }, [currentStyle, colorScheme, showDataViz]);

  useEffect(() => {
    const fetchDeviceCount = async () => {
      try {
        const count = await ApiService.getDeviceCount();
        setDeviceCount(count);
      } catch (err) {
        console.error("Failed to fetch device count:", err);
      }
    };

    fetchDeviceCount();
    // Refresh count every 5 minutes
    const interval = setInterval(fetchDeviceCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStyleChange = (style: MapStyle) => setCurrentStyle(style);

  const handleColorChange = (colorType: keyof ColorScheme, value: string) => {
    setColorScheme((prev) => ({ ...prev, [colorType]: value }));
  };

  return (
    <>
      <div ref={mapRef} style={{ width: "100vw", height: "100vh" }} />

      {loading && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(0, 0, 0, 0.8)", color: "#fff",
          padding: "20px 40px", borderRadius: "8px", zIndex: 2000,
        }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255, 0, 0, 0.9)", color: "#fff",
          padding: "20px 40px", borderRadius: "8px", zIndex: 2000,
        }}>
          {error}
        </div>
      )}

      {/* Badge */}
      {!loading && !error && (
        <div style={{
          position: "absolute", bottom: "20px", right: "0px",
          background: "rgba(0, 0, 0, 0.8)", color: "#fff",
          padding: "8px 12px", borderRadius: "6px", fontSize: "11px",
          fontWeight: "bold", zIndex: 1000,
          border: "2px solid rgba(255, 255, 255, 0.3)",
          display: "flex", alignItems: "center", gap: "10px",
          backdropFilter: "blur(4px)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Total Devices:</span>
            <span style={{ color: colorScheme.primary, fontSize: "12px" }}>
              {deviceCount !== null ? deviceCount.toLocaleString() : "..."}
            </span>
          </div>
        </div>
      )}

      {/* Menu Buttons */}
      <div
        style={{
          position: "absolute",
          top: "15px",
          right: "15px",
          display: "flex",
          gap: "6px",
          zIndex: 1001,
          opacity: isMenuHovered ? 1 : 0.3,
          transition: "opacity 0.3s ease",
        }}
        onMouseEnter={() => setIsMenuHovered(true)}
        onMouseLeave={() => setIsMenuHovered(false)}
      >
        {/* Settings Button */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: "6px 12px",
              background: showSettings
                ? "rgba(255, 59, 48, 0.9)"
                : "rgba(0, 0, 0, 0.7)",
              color: "#fff",
              border: "2px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
            }}
            title="Settings"
          >
            <Settings size={14} style={{ marginRight: isMenuHovered ? "6px" : "0", transition: "margin 0.2s" }} />
            <span style={{
              maxWidth: isMenuHovered ? "100px" : "0",
              opacity: isMenuHovered ? 1 : 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
              transition: "all 0.3s ease",
              display: "inline-block"
            }}>
              Settings
            </span>
          </button>

          {/* Unified Settings Panel */}
          {showSettings && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: "0",
                background: "rgba(0, 0, 0, 0.95)",
                backdropFilter: "blur(10px)",
                borderRadius: "12px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                width: "280px",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              }}
            >
              {/* Data Visualization Section */}
              <section>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                  Visualization Mode
                  <BarChart3 size={12} />
                </div>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.1)", borderRadius: "8px", padding: "4px" }}>
                  <button
                    onClick={() => setShowDataViz(false)}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: !showDataViz ? "rgba(255, 255, 255, 0.2)" : "transparent",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    📍 Clusters
                  </button>
                  <button
                    onClick={() => setShowDataViz(true)}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: showDataViz ? "rgba(255, 255, 255, 0.2)" : "transparent",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    🔥 Heatmap
                  </button>
                </div>
              </section>

              {/* Map Style Section */}
              <section>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                  Map Style
                  <Map size={12} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(Object.keys(MAP_STYLES) as MapStyle[]).map((style) => (
                    <button
                      key={style}
                      onClick={() => handleStyleChange(style)}
                      style={{
                        padding: "8px",
                        background: currentStyle === style ? "rgba(255, 59, 48, 0.8)" : "rgba(255, 255, 255, 0.1)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "10px",
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      {style === "satelliteStreets" ? "Sat Streets" : style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </section>

              {/* Color Scheme Section */}
              <section>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                  Color Scheme
                  <Palette size={12} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {(["primary", "secondary", "tertiary"] as const).map((colorType) => (
                    <div key={colorType} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ color: "#fff", fontSize: "10px", textTransform: "capitalize" }}>{colorType}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#888", fontSize: "9px", fontFamily: "monospace" }}>{colorScheme[colorType]}</span>
                        <input
                          type="color"
                          value={colorScheme[colorType]}
                          onChange={(e) => handleColorChange(colorType, e.target.value)}
                          style={{
                            width: "24px", height: "24px", padding: 0, border: "none",
                            borderRadius: "4px", cursor: "pointer", background: "transparent",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Presets */}
                <div style={{ display: "flex", gap: "4px", marginTop: "12px", overflowX: "auto", paddingBottom: "4px" }}>
                  {[
                    { name: "Hot", colors: { primary: "#ff3b30", secondary: "#ff9500", tertiary: "#ffcc00" } },
                    { name: "Cool", colors: { primary: "#007aff", secondary: "#5ac8fa", tertiary: "#a0d9ff" } },
                    { name: "Green", colors: { primary: "#34c759", secondary: "#30d158", tertiary: "#a8f5ba" } },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setColorScheme(preset.colors)}
                      style={{
                        padding: "4px 8px",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px",
                        cursor: "pointer", fontSize: "9px", color: "#fff",
                      }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Logout Button */}
        {/* <button
          onClick={onLogout}
          style={{
            padding: "6px 12px",
            background: "rgba(255, 59, 48, 0.9)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            transition: "all 0.2s",
          }}
        >
          <LogOut size={14} style={{ marginRight: isMenuHovered ? "6px" : "0", transition: "margin 0.2s" }} />
          <span style={{
            maxWidth: isMenuHovered ? "100px" : "0",
            opacity: isMenuHovered ? 1 : 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            transition: "all 0.3s ease",
            display: "inline-block"
          }}>
            Logout
          </span>
        </button> */}
      </div>

      {/* Clean up old panels */}
    </>
  );
}
