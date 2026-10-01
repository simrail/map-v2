import { useRef, useState, type ReactNode } from "react";
import { LayerGroup } from "react-leaflet";

type LazyLayerProps<T> = {
	/** Must be stable, e.g. defined at module level. */
	load: () => Promise<T>;
	children: (data: T) => ReactNode;
};

/**
 * Loads a layer's data the first time the layer is shown. react-leaflet
 * mounts the children of a LayersControl overlay even while it's
 * unchecked, so loading on mount would fetch data for layers nobody turned
 * on; this group's `add` event fires only once it's actually on the map.
 */
export function LazyLayer<T>({ load, children }: LazyLayerProps<T>) {
	const [data, setData] = useState<T | null>(null);
	const requested = useRef(false);

	const onAdd = () => {
		if (requested.current) return;
		requested.current = true;
		load().then(setData, () => {
			requested.current = false; // retry the next time it's shown
		});
	};

	return (
		<LayerGroup eventHandlers={{ add: onAdd }}>
			{data !== null && children(data)}
		</LayerGroup>
	);
}
