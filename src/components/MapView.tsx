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
  const [showMapStyle, setShowMapStyle] = useState(false);
  const [showDataViz, setShowDataViz] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const addMVTLayers = (map: mapboxgl.Map, colors: ColorScheme) => {
    // Remove existing layers
    const layersToRemove = ["mvt-clusters", "mvt-cluster-count", "mvt-points"];
    layersToRemove.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

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
          10, colors.secondary,
          50, colors.primary,
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          15,
          10, 20,
          50, 25,
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
  };

  useEffect(() => {
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
        // Add MVT source
        map.addSource("mvt-points", {
          type: "vector",
          tiles: [MVT_TILES_URL],
          minzoom: 0,
          maxzoom: 14,
        });

        addMVTLayers(map, colorScheme);

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

        // Cursor on hover
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

    return () => map.remove();
  }, [currentStyle, colorScheme]);

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
      {/* {!loading && !error && (
        <div style={{
          position: "absolute", bottom: "20px", right: "20px",
          background: "rgba(0, 0, 0, 0.8)", color: "#fff",
          padding: "8px 12px", borderRadius: "6px", fontSize: "11px",
          fontWeight: "bold", zIndex: 1000,
          border: "2px solid rgba(255, 255, 255, 0.3)",
        }}>
          MVT Vector Tiles
        </div>
      )} */}

      {/* Menu Buttons */}
      <div
        style={{
          position: "absolute",
          top: "15px",
          right: "15px",
          display: "flex",
          gap: "6px",
          zIndex: 1001,
          opacity: 0.3,
          transition: "opacity 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.3";
        }}
      >
        {/* Settings Dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              padding: "6px 10px",
              background: showDropdown
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
            title="Settings"
          >
            <Settings size={14} style={{ marginRight: "4px" }} />
            Settings
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: "0",
                background: "rgba(0, 0, 0, 0.9)",
                borderRadius: "6px",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                minWidth: "160px",
                border: "2px solid rgba(255, 255, 255, 0.3)",
              }}
            >
              <button
                onClick={() => {
                  setShowMapStyle(!showMapStyle);
                  setShowDropdown(false);
                }}
                style={{
                  padding: "8px 12px",
                  background: showMapStyle
                    ? "rgba(255, 59, 48, 0.9)"
                    : "rgba(40, 40, 40, 0.8)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "bold",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!showMapStyle) {
                    e.currentTarget.style.background = "rgba(60, 60, 60, 0.8)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showMapStyle) {
                    e.currentTarget.style.background = "rgba(40, 40, 40, 0.8)";
                  }
                }}
              >
                <Map size={14} style={{ marginRight: "8px" }} />
                Map Style
              </button>

              <button
                onClick={() => {
                  setShowDataViz(!showDataViz);
                  setShowDropdown(false);
                }}
                style={{
                  padding: "8px 12px",
                  background: showDataViz
                    ? "rgba(255, 59, 48, 0.9)"
                    : "rgba(40, 40, 40, 0.8)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "bold",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!showDataViz) {
                    e.currentTarget.style.background = "rgba(60, 60, 60, 0.8)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showDataViz) {
                    e.currentTarget.style.background = "rgba(40, 40, 40, 0.8)";
                  }
                }}
              >
                <BarChart3 size={14} style={{ marginRight: "8px" }} />
                Visualization
              </button>

              <button
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowDropdown(false);
                }}
                style={{
                  padding: "8px 12px",
                  background: showColorPicker
                    ? "rgba(255, 59, 48, 0.9)"
                    : "rgba(40, 40, 40, 0.8)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "bold",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!showColorPicker) {
                    e.currentTarget.style.background = "rgba(60, 60, 60, 0.8)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showColorPicker) {
                    e.currentTarget.style.background = "rgba(40, 40, 40, 0.8)";
                  }
                }}
              >
                <Palette size={14} style={{ marginRight: "8px" }} />
                Colors
              </button>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          style={{
            padding: "6px 10px", background: "rgba(255, 59, 48, 0.9)",
            color: "#fff", border: "2px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "5px", cursor: "pointer", fontSize: "11px",
            fontWeight: "bold", display: "flex", alignItems: "center",
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
            top: "60px",
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
                border: currentStyle === style ? "2px solid #ff3b30" : "2px solid #444",
                borderRadius: "4px", cursor: "pointer", fontSize: "13px",
                fontWeight: currentStyle === style ? "bold" : "normal",
              }}
            >
              {style === "satelliteStreets" ? "Satellite Streets" : style.charAt(0).toUpperCase() + style.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Color Picker Panel */}
      {showColorPicker && (
        <div style={{
          position: "absolute", bottom: "20px", left: "20px",
          background: "rgba(0, 0, 0, 0.8)", borderRadius: "8px",
          padding: "12px", display: "flex", flexDirection: "column",
          gap: "12px", zIndex: 1000,
        }}>
          <div style={{ color: "#fff", fontSize: "14px", fontWeight: "bold" }}>
            Color Scheme
          </div>
          {(["primary", "secondary", "tertiary"] as const).map((colorType) => (
            <div key={colorType} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ color: "#fff", fontSize: "12px", minWidth: "70px" }}>
                {colorType.charAt(0).toUpperCase() + colorType.slice(1)}:
              </label>
              <input
                type="color"
                value={colorScheme[colorType]}
                onChange={(e) => handleColorChange(colorType, e.target.value)}
                style={{
                  width: "50px", height: "30px", border: "2px solid #444",
                  borderRadius: "4px", cursor: "pointer", background: "transparent",
                }}
              />
              <span style={{ color: "#aaa", fontSize: "11px", fontFamily: "monospace" }}>
                {colorScheme[colorType]}
              </span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #444", paddingTop: "8px" }}>
            <div style={{ color: "#fff", fontSize: "12px", marginBottom: "8px" }}>Presets:</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { name: "Hot", colors: { primary: "#ff3b30", secondary: "#ff9500", tertiary: "#ffcc00" } },
                { name: "Cool", colors: { primary: "#007aff", secondary: "#5ac8fa", tertiary: "#a0d9ff" } },
                { name: "Green", colors: { primary: "#34c759", secondary: "#30d158", tertiary: "#a8f5ba" } },
                { name: "Purple", colors: { primary: "#af52de", secondary: "#bf5af2", tertiary: "#e5b3ff" } },
              ].map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setColorScheme(preset.colors)}
                  style={{
                    padding: "6px 10px",
                    background: `linear-gradient(135deg, ${preset.colors.primary}, ${preset.colors.secondary}, ${preset.colors.tertiary})`,
                    border: "2px solid #444", borderRadius: "4px",
                    cursor: "pointer", fontSize: "11px", color: "#fff", fontWeight: "bold",
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
