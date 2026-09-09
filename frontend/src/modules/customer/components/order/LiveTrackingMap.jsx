import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import {
  MapPin,
  Clock,
  Search,
  Loader2,
  Truck,
  Store as StoreIcon,
  Home,
  Navigation2,
} from "lucide-react";
import customerPin from "@/assets/customer-pin.png";
import deliveryIcon from "@/assets/deliveryIcon.png";
import storePin from "@/assets/store-pin.png";

const libraries = ["geometry"];

const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "380px",
};

const RECENTER_INTERVAL_MS = 15000;
const SNAP_MAX_DISTANCE_M = 300;
const BEARING_CHANGE_THRESHOLD_DEG = 10;
const RIDER_ICON_SIZE = 48;
const DOTTED_ANIMATION_INTERVAL_MS = 80;

/** Delivery / rider search — not the same as waiting for seller acceptance */
const SEARCHING_STATUSES = [
  "pending",
  "confirmed",
  "delivery_search",
  "DELIVERY_SEARCH",
  "seller_accepted",
  "SELLER_ACCEPTED",
  "created",
  "CREATED",
];

function hasValidLatLng(location) {
  return (
    location &&
    typeof location.lat === "number" &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng)
  );
}

function distanceMeters(from, to) {
  if (!hasValidLatLng(from) || !hasValidLatLng(to)) return null;
  const r = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute bearing in degrees (0-360, 0=north, 90=east) from A to B */
function computeBearing(from, to) {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** Snap rider to the closest point on a polyline path */
function snapToPolyline(riderPos, path) {
  if (!riderPos || !path || path.length < 2) return null;

  const rLat = riderPos.lat;
  const rLng = riderPos.lng;
  if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) return null;

  let bestDist = Infinity;
  let bestPoint = null;
  let bestSegIdx = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const aLat =
      typeof path[i].lat === "function" ? path[i].lat() : path[i].lat;
    const aLng =
      typeof path[i].lng === "function" ? path[i].lng() : path[i].lng;
    const bLat =
      typeof path[i + 1].lat === "function"
        ? path[i + 1].lat()
        : path[i + 1].lat;
    const bLng =
      typeof path[i + 1].lng === "function"
        ? path[i + 1].lng()
        : path[i + 1].lng;

    const abLat = bLat - aLat;
    const abLng = bLng - aLng;
    const apLat = rLat - aLat;
    const apLng = rLng - aLng;

    const ab2 = abLat * abLat + abLng * abLng;
    let t = ab2 === 0 ? 0 : (apLat * abLat + apLng * abLng) / ab2;
    t = Math.max(0, Math.min(1, t));

    const projLat = aLat + t * abLat;
    const projLng = aLng + t * abLng;

    const d = distanceMeters(
      { lat: rLat, lng: rLng },
      { lat: projLat, lng: projLng }
    );
    if (d !== null && d < bestDist) {
      bestDist = d;
      bestPoint = { lat: projLat, lng: projLng };
      bestSegIdx = i;
    }
  }

  if (!bestPoint || bestDist > SNAP_MAX_DISTANCE_M) return null;

  const aLat =
    typeof path[bestSegIdx].lat === "function"
      ? path[bestSegIdx].lat()
      : path[bestSegIdx].lat;
  const aLng =
    typeof path[bestSegIdx].lng === "function"
      ? path[bestSegIdx].lng()
      : path[bestSegIdx].lng;
  const bLat =
    typeof path[bestSegIdx + 1].lat === "function"
      ? path[bestSegIdx + 1].lat()
      : path[bestSegIdx + 1].lat;
  const bLng =
    typeof path[bestSegIdx + 1].lng === "function"
      ? path[bestSegIdx + 1].lng()
      : path[bestSegIdx + 1].lng;
  const bearing = computeBearing(
    { lat: aLat, lng: aLng },
    { lat: bLat, lng: bLng }
  );

  return {
    point: bestPoint,
    segmentIndex: bestSegIdx,
    bearing,
    distance: bestDist,
  };
}

/** Draw the delivery icon rotated by `angleDeg` on an offscreen canvas */
function rotateIconOnCanvas(image, angleDeg, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

/** Decode encoded polyline string */
function decodePolylineStr(encoded) {
  if (
    !encoded ||
    !window.google?.maps?.geometry?.encoding
  )
    return null;
  try {
    return window.google.maps.geometry.encoding.decodePath(encoded);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const LiveTrackingMap = memo(
  ({
    status = "out for delivery",
    eta = "8 mins",
    riderName = "Delivery Partner",
    riderLocation,
    sellerLocation,
    destinationLocation,
    routePhase = "pickup",
    pickupRoute,
    deliveryRoute,
    order,
    onOpenInMaps,
  }) => {
    const mapRef = useRef(null);
    const [mapInstance, setMapInstance] = useState(null);
    const isSearching = SEARCHING_STATUSES.includes(status?.toLowerCase?.());
    const [dots, setDots] = useState("");

    // Polyline refs (native google.maps.Polyline — prevents React duplicate overlays)
    const pickupPolylineRef = useRef(null);
    const deliveryPolylineRef = useRef(null);
    const dottedAnimIntervalRef = useRef(null);

    // Snap-to-polyline + rotation state
    const [snappedRider, setSnappedRider] = useState(null);
    const lastBearingRef = useRef(0);
    const iconImageRef = useRef(null);
    const [rotatedIconUrl, setRotatedIconUrl] = useState(null);

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

    const { isLoaded, loadError } = useJsApiLoader({
      id: "customer-tracking-map",
      googleMapsApiKey: apiKey,
      libraries,
    });

    const onMapLoad = useCallback((map) => {
      mapRef.current = map;
      setMapInstance(map);
    }, []);

    // ── Decode polylines ──────────────────────────────────────────────────
    const decodedPickupPath = useMemo(() => {
      if (!isLoaded || !pickupRoute?.polyline) return null;
      return decodePolylineStr(pickupRoute.polyline);
    }, [isLoaded, pickupRoute?.polyline]);

    const decodedDeliveryPath = useMemo(() => {
      if (!isLoaded || !deliveryRoute?.polyline) return null;
      return decodePolylineStr(deliveryRoute.polyline);
    }, [isLoaded, deliveryRoute?.polyline]);

    // ── Preload delivery icon for canvas rotation ─────────────────────────
    useEffect(() => {
      if (iconImageRef.current) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = deliveryIcon;
      img.onload = () => {
        iconImageRef.current = img;
        const url = rotateIconOnCanvas(img, 0, RIDER_ICON_SIZE);
        setRotatedIconUrl(url);
      };
    }, []);

    // ── Snap rider to active-phase polyline ───────────────────────────────
    useEffect(() => {
      if (!riderLocation) {
        setSnappedRider(null);
        return;
      }

      const activePath =
        routePhase === "delivery" ? decodedDeliveryPath : decodedPickupPath;
      if (!activePath?.length) {
        setSnappedRider(null);
        return;
      }

      const result = snapToPolyline(riderLocation, activePath);
      if (!result) {
        setSnappedRider(null);
        return;
      }

      setSnappedRider(result.point);

      const diff = Math.abs(result.bearing - lastBearingRef.current);
      const normDiff = diff > 180 ? 360 - diff : diff;
      if (normDiff > BEARING_CHANGE_THRESHOLD_DEG) {
        lastBearingRef.current = result.bearing;
        if (iconImageRef.current) {
          const url = rotateIconOnCanvas(
            iconImageRef.current,
            result.bearing,
            RIDER_ICON_SIZE
          );
          setRotatedIconUrl(url);
        }
      }
    }, [riderLocation, decodedPickupPath, decodedDeliveryPath, routePhase]);

    // ── Draw PICKUP polyline (animated dotted) ────────────────────────────
    useEffect(() => {
      if (!isLoaded || !mapInstance || !window.google?.maps) return undefined;

      // Cleanup previous
      if (pickupPolylineRef.current) {
        pickupPolylineRef.current.setMap(null);
        pickupPolylineRef.current = null;
      }
      if (dottedAnimIntervalRef.current) {
        clearInterval(dottedAnimIntervalRef.current);
        dottedAnimIntervalRef.current = null;
      }

      if (!decodedPickupPath?.length) return undefined;

      // Animated dotted line using google.maps.Symbol icons
      const lineSymbol = {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillOpacity: 1,
        fillColor: "#F97316",
        strokeOpacity: 0,
        scale: 3.5,
      };

      const pl = new window.google.maps.Polyline({
        path: decodedPickupPath,
        strokeOpacity: 0, // invisible base line
        strokeWeight: 0,
        map: mapInstance,
        zIndex: 8,
        icons: [
          {
            icon: lineSymbol,
            offset: "0%",
            repeat: "14px",
          },
        ],
      });

      pickupPolylineRef.current = pl;

      // Animate the dots flowing along the path
      let animOffset = 0;
      dottedAnimIntervalRef.current = setInterval(() => {
        animOffset = (animOffset + 0.5) % 100;
        if (pickupPolylineRef.current) {
          pickupPolylineRef.current.set("icons", [
            {
              icon: lineSymbol,
              offset: animOffset + "%",
              repeat: "14px",
            },
          ]);
        }
      }, DOTTED_ANIMATION_INTERVAL_MS);

      return () => {
        if (pickupPolylineRef.current) {
          pickupPolylineRef.current.setMap(null);
          pickupPolylineRef.current = null;
        }
        if (dottedAnimIntervalRef.current) {
          clearInterval(dottedAnimIntervalRef.current);
          dottedAnimIntervalRef.current = null;
        }
      };
    }, [isLoaded, mapInstance, decodedPickupPath]);

    // ── Draw DELIVERY polyline (solid green) ──────────────────────────────
    useEffect(() => {
      if (!isLoaded || !mapInstance || !window.google?.maps) return undefined;

      if (deliveryPolylineRef.current) {
        deliveryPolylineRef.current.setMap(null);
        deliveryPolylineRef.current = null;
      }

      if (!decodedDeliveryPath?.length) return undefined;

      const pl = new window.google.maps.Polyline({
        path: decodedDeliveryPath,
        strokeColor: "#16A34A",
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: mapInstance,
        zIndex: 10,
      });

      deliveryPolylineRef.current = pl;

      return () => {
        if (deliveryPolylineRef.current) {
          deliveryPolylineRef.current.setMap(null);
          deliveryPolylineRef.current = null;
        }
      };
    }, [isLoaded, mapInstance, decodedDeliveryPath]);

    // ── Marker icons ──────────────────────────────────────────────────────
    const riderMarkerIcon = useMemo(() => {
      if (!isLoaded || !window.google?.maps) return undefined;
      const iconUrl = rotatedIconUrl || deliveryIcon;
      return {
        url: iconUrl,
        scaledSize: new window.google.maps.Size(RIDER_ICON_SIZE, RIDER_ICON_SIZE),
        anchor: new window.google.maps.Point(
          RIDER_ICON_SIZE / 2,
          RIDER_ICON_SIZE / 2
        ),
      };
    }, [isLoaded, rotatedIconUrl]);

    const customerMarkerIcon = useMemo(() => {
      if (!isLoaded || !window.google?.maps) return undefined;
      return {
        url: customerPin,
        scaledSize: new window.google.maps.Size(44, 44),
        anchor: new window.google.maps.Point(22, 44),
      };
    }, [isLoaded]);

    const storeMarkerIcon = useMemo(() => {
      if (!isLoaded || !window.google?.maps) return undefined;
      return {
        url: storePin,
        scaledSize: new window.google.maps.Size(44, 44),
        anchor: new window.google.maps.Point(22, 44),
      };
    }, [isLoaded]);

    // ── Map center ────────────────────────────────────────────────────────
    const mapCenter = useMemo(() => {
      if (snappedRider) return snappedRider;
      if (riderLocation) return riderLocation;
      if (hasValidLatLng(sellerLocation)) return sellerLocation;
      if (hasValidLatLng(destinationLocation)) return destinationLocation;
      return { lat: 20.5937, lng: 78.9629 };
    }, [snappedRider, riderLocation, sellerLocation, destinationLocation]);

    // ── Fit all markers and routes ────────────────────────────────────────
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !window.google) return;

      try {
        const bounds = new window.google.maps.LatLngBounds();
        let hasPoints = false;

        // Include all route points
        if (decodedPickupPath?.length) {
          decodedPickupPath.forEach((p) => bounds.extend(p));
          hasPoints = true;
        }
        if (decodedDeliveryPath?.length) {
          decodedDeliveryPath.forEach((p) => bounds.extend(p));
          hasPoints = true;
        }

        // Include markers
        const riderPos = snappedRider || riderLocation;
        if (hasValidLatLng(riderPos)) {
          bounds.extend(riderPos);
          hasPoints = true;
        }
        if (hasValidLatLng(sellerLocation)) {
          bounds.extend(sellerLocation);
          hasPoints = true;
        }
        if (hasValidLatLng(destinationLocation)) {
          bounds.extend(destinationLocation);
          hasPoints = true;
        }

        if (hasPoints) {
          map.fitBounds(bounds, {
            top: 80,
            bottom: 100,
            left: 24,
            right: 24,
          });
        }
      } catch {
        /* ignore */
      }
    }, [
      decodedPickupPath,
      decodedDeliveryPath,
      snappedRider,
      riderLocation,
      sellerLocation,
      destinationLocation,
    ]);

    // ── Keep rider centered (recenter every 15s) ──────────────────────────
    useEffect(() => {
      if (!isLoaded || !mapRef.current) return undefined;
      const riderPos = snappedRider || riderLocation;
      if (!hasValidLatLng(riderPos)) return undefined;

      const intervalId = setInterval(() => {
        const map = mapRef.current;
        if (!map) return;
        const pos = snappedRider || riderLocation;
        if (!hasValidLatLng(pos)) return;
        map.panTo(pos);
      }, RECENTER_INTERVAL_MS);

      return () => clearInterval(intervalId);
    }, [
      isLoaded,
      snappedRider?.lat,
      snappedRider?.lng,
      riderLocation?.lat,
      riderLocation?.lng,
    ]);

    // ── Searching dots animation ──────────────────────────────────────────
    useEffect(() => {
      if (!isSearching) return;
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }, [isSearching]);

    // ── Determine phase-aware status text ─────────────────────────────────
    const statusText = useMemo(() => {
      const norm = status?.toLowerCase?.() || "";
      if (norm === "delivered" || norm === "DELIVERED") return "Order delivered!";
      if (routePhase === "pickup")
        return "Rider is heading to the store";
      return "Your order is on the way!";
    }, [status, routePhase]);

    // ── Edge cases ────────────────────────────────────────────────────────
    const norm = status?.toLowerCase?.() || "";

    if (norm === "cancelled" || norm === "canceled") {
      return (
        <div className="relative w-full min-h-[220px] bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden rounded-b-[2rem] flex flex-col items-center justify-center gap-3 px-6 py-10 border-b border-slate-200">
          <div className="h-14 w-14 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
            <Clock size={28} />
          </div>
          <h3 className="text-lg font-black text-slate-800 text-center">
            Order cancelled
          </h3>
          <p className="text-sm text-slate-500 text-center max-w-sm font-medium">
            This order is closed. If payment was reserved, any applicable refund
            follows your store policy.
          </p>
        </div>
      );
    }

    if (norm === "seller_pending") {
      return (
        <div className="relative w-full min-h-[260px] bg-gradient-to-br from-[#f0faf4] to-[#e8f5e9] overflow-hidden rounded-b-[2rem] flex flex-col items-center justify-center gap-3 px-6 py-10 border-b border-brand-100">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="h-16 w-16 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-brand-200"
          >
            <Clock size={30} className="text-white" />
          </motion.div>
          <h3 className="text-lg font-black text-gray-800 text-center">
            Waiting for seller to accept
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-sm font-medium">
            The store has up to 60 seconds to confirm. If they don&apos;t, your
            order will be cancelled automatically.
          </p>
        </div>
      );
    }

    // ─── SEARCHING STATE ──────────────────────────────────────────────────
    if (isSearching) {
      return (
        <div className="relative w-full h-[320px] bg-gradient-to-br from-[#f0faf4] to-[#e8f5e9] overflow-hidden rounded-b-[2rem] flex flex-col items-center justify-center gap-4">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border-2 border-primary/20"
              initial={{ width: 60, height: 60, opacity: 0.8 }}
              animate={{
                width: 60 + i * 70,
                height: 60 + i * 70,
                opacity: 0,
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeOut",
              }}
            />
          ))}

          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="relative z-10 h-16 w-16 bg-primary rounded-full flex items-center justify-center shadow-xl shadow-brand-200"
          >
            <Search size={28} className="text-white" />
          </motion.div>

          <div className="relative z-10 text-center px-6">
            <h3 className="text-lg font-black text-gray-800">
              Searching for delivery partner{dots}
            </h3>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Hang tight! We're finding the best rider near you.
            </p>
          </div>

          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative z-10 bg-white px-4 py-2 rounded-full shadow-md border border-brand-100 flex items-center gap-2"
          >
            <div className="h-2 w-2 bg-brand-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              {status === "confirmed"
                ? "Order Confirmed · Assigning Rider"
                : "Order Placed · Finding Rider"}
            </span>
          </motion.div>
        </div>
      );
    }

    // ─── LIVE TRACKING STATE ──────────────────────────────────────────────

    if (!apiKey) {
      return (
        <div className="relative w-full h-[380px] bg-slate-100 rounded-b-[2rem] flex items-center justify-center text-center px-4">
          <p className="text-xs text-slate-500">
            Set <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to
            show live tracking.
          </p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="relative w-full h-[380px] bg-rose-50 rounded-b-[2rem] flex items-center justify-center text-xs text-rose-700 px-4">
          Map failed to load. Check the API key and billing.
        </div>
      );
    }

    if (!isLoaded) {
      return (
        <div className="relative w-full h-[380px] bg-slate-50 rounded-b-[2rem] flex items-center justify-center">
          <Loader2 className="animate-spin text-brand-600" size={28} />
        </div>
      );
    }

    return (
      <div className="relative w-full h-[380px] bg-[#E5E3DF] overflow-hidden rounded-b-[2rem] shadow-md border-b border-gray-200">
        {/* Google Map */}
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapCenter}
          zoom={14}
          onLoad={onMapLoad}
          options={{
            disableDefaultUI: true,
            zoomControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          }}
        >
          {/* Rider Marker (snapped to polyline if available) */}
          {(snappedRider || riderLocation) && (
            <Marker
              position={snappedRider || riderLocation}
              title="Delivery Partner"
              icon={riderMarkerIcon}
              zIndex={100}
            />
          )}

          {/* Store/Seller Marker — ALWAYS shown */}
          {hasValidLatLng(sellerLocation) && (
            <Marker
              position={sellerLocation}
              title="Store Location"
              icon={storeMarkerIcon}
              zIndex={50}
            />
          )}

          {/* Customer/Destination Marker — ALWAYS shown */}
          {hasValidLatLng(destinationLocation) && (
            <Marker
              position={destinationLocation}
              title="Your Location"
              icon={customerMarkerIcon}
              zIndex={50}
            />
          )}
        </GoogleMap>

      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.status === nextProps.status &&
      prevProps.eta === nextProps.eta &&
      prevProps.riderName === nextProps.riderName &&
      prevProps.riderLocation?.lat === nextProps.riderLocation?.lat &&
      prevProps.riderLocation?.lng === nextProps.riderLocation?.lng &&
      prevProps.sellerLocation?.lat === nextProps.sellerLocation?.lat &&
      prevProps.sellerLocation?.lng === nextProps.sellerLocation?.lng &&
      prevProps.destinationLocation?.lat ===
        nextProps.destinationLocation?.lat &&
      prevProps.destinationLocation?.lng ===
        nextProps.destinationLocation?.lng &&
      prevProps.routePhase === nextProps.routePhase &&
      prevProps.pickupRoute?.polyline === nextProps.pickupRoute?.polyline &&
      prevProps.deliveryRoute?.polyline === nextProps.deliveryRoute?.polyline
    );
  }
);

LiveTrackingMap.displayName = "LiveTrackingMap";

export default LiveTrackingMap;
