import L from "leaflet";
import { useEffect, useRef } from "react";
import { Popup, type PopupProps } from "react-leaflet";

const POPUP_TIP_HEIGHT = 20;
const POPUP_EDGE_PADDING = 10;
// Keeps the tip from sliding past the rounded corners of the popup body.
const POPUP_TIP_INSET = 30;

type PopupInternals = {
	_map?: L.Map;
	_getAnchor: () => L.Point;
};

// Places the popup above or below its anchor (whichever fits) and shifts it
// horizontally to stay inside the map, instead of letting Leaflet pan the map.
const placePopupInsideMap = (popup: L.Popup) => {
	const internals = popup as unknown as PopupInternals;
	const map = internals._map;
	const container = popup.getElement();
	const latLng = popup.getLatLng();
	if (!map || !container || !latLng) return;

	const wrapper = container.querySelector<HTMLElement>(
		".leaflet-popup-content-wrapper",
	);
	const tipContainer = container.querySelector<HTMLElement>(
		".leaflet-popup-tip-container",
	);
	if (!wrapper) return;

	const width = wrapper.offsetWidth;
	const height = wrapper.offsetHeight;
	const mapSize = map.getSize();
	// The popup anchor (e.g. the icon's popupAnchor) is where the tip points
	// when the popup sits above the marker; mirror it when placing below.
	const anchor = internals._getAnchor();
	const point = map.latLngToContainerPoint(latLng).add([anchor.x, 0]);

	const spaceAbove = point.y + anchor.y - POPUP_TIP_HEIGHT - height;
	const spaceBelow =
		mapSize.y - (point.y - anchor.y + POPUP_TIP_HEIGHT + height);
	const placeBelow = spaceAbove < POPUP_EDGE_PADDING && spaceBelow > spaceAbove;

	const minShift = POPUP_EDGE_PADDING - (point.x - width / 2);
	const maxShift = mapSize.x - POPUP_EDGE_PADDING - (point.x + width / 2);
	// Prefer the left edge when the popup is wider than the map.
	const fitShift =
		minShift > maxShift ? minShift : Math.min(Math.max(0, minShift), maxShift);
	const shiftX = Math.round(fitShift);
	// The tip stays over the anchor unless that would put it past the body's
	// rounded corners (anchor right at the map edge); then it stops there.
	const maxTipShift = Math.max(0, width / 2 - POPUP_TIP_INSET);
	const tipShift = Math.min(Math.max(shiftX, -maxTipShift), maxTipShift);
	const shiftY = placeBelow ? -2 * anchor.y + 2 * POPUP_TIP_HEIGHT + height : 0;

	container.classList.toggle("popup-below", placeBelow);
	if (tipContainer) tipContainer.style.marginLeft = `${-20 - tipShift}px`;

	const current = L.point(popup.options.offset ?? [0, 0]);
	if (current.x === shiftX && current.y === shiftY) return;
	popup.options.offset = L.point(shiftX, shiftY);
	popup.update();
};

// A popup that repositions itself to fit inside the map instead of panning it.
const HoverPopup = (props: PopupProps) => {
	const popupRef = useRef<L.Popup | null>(null);

	useEffect(() => {
		const popup = popupRef.current;
		if (!popup) return;

		let observer: ResizeObserver | null = null;
		let map: L.Map | null = null;
		const place = () => placePopupInsideMap(popup);
		const onAdd = () => {
			const wrapper = popup
				.getElement()
				?.querySelector(".leaflet-popup-content-wrapper");
			if (!wrapper) return;
			// Also fires once the content renders or changes size (e.g. images).
			observer = new ResizeObserver(place);
			observer.observe(wrapper);
			// The anchor moves within the map when it's panned, zoomed or resized.
			map = (popup as unknown as PopupInternals)._map ?? null;
			map?.on("resize moveend zoomend", place);
		};
		const onRemove = () => {
			observer?.disconnect();
			observer = null;
			map?.off("resize moveend zoomend", place);
			map = null;
		};

		popup.on("add", onAdd);
		popup.on("remove", onRemove);
		return () => {
			popup.off("add", onAdd);
			popup.off("remove", onRemove);
			onRemove();
		};
	}, []);

	return <Popup ref={popupRef} autoPan={false} {...props} />;
};

export default HoverPopup;
