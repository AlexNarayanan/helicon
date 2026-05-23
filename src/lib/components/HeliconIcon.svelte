<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let { size = 36 }: { size?: number } = $props();

	let phase = $state(0);
	let raf: number;

	function tick() {
		phase += 0.05;
		raf = requestAnimationFrame(tick);
	}

	onMount(() => {
		raf = requestAnimationFrame(tick);
	});

	onDestroy(() => {
		if (browser) cancelAnimationFrame(raf);
	});

	function sinePath(offsetY: number, amplitude: number, phaseShift: number): string {
		const steps = 20;
		const xStart = 8;
		const xEnd = size - 8;
		const points: string[] = [];
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const x = xStart + t * (xEnd - xStart);
			const y = offsetY + Math.sin(t * Math.PI * 2 + phase + phaseShift) * amplitude;
			points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
		}
		return points.join(' ');
	}

	const string1 = $derived(sinePath(size * 0.45, 2.5, 0));
	const string2 = $derived(sinePath(size * 0.55, 2.0, Math.PI * 0.66));
	const string3 = $derived(sinePath(size * 0.65, 2.5, Math.PI * 1.33));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	xmlns="http://www.w3.org/2000/svg"
	aria-label="Helicon"
	role="img"
>
	<!-- Lyre frame: two curved arms -->
	<path
		d="M{size * 0.28},{size * 0.75} C{size * 0.1},{size * 0.55} {size * 0.1},{size * 0.3} {size *
			0.28},{size * 0.18}"
		fill="none"
		stroke="var(--color-primary)"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<path
		d="M{size * 0.72},{size * 0.75} C{size * 0.9},{size * 0.55} {size * 0.9},{size * 0.3} {size *
			0.72},{size * 0.18}"
		fill="none"
		stroke="var(--color-primary)"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<!-- Crossbar -->
	<line
		x1={size * 0.2}
		y1={size * 0.18}
		x2={size * 0.8}
		y2={size * 0.18}
		stroke="var(--color-primary)"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<!-- Base -->
	<line
		x1={size * 0.25}
		y1={size * 0.78}
		x2={size * 0.75}
		y2={size * 0.78}
		stroke="var(--color-primary)"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<!-- Animated sine-wave strings -->
	<path d={string1} fill="none" stroke="var(--color-accent)" stroke-width="1.2" stroke-linecap="round" />
	<path d={string2} fill="none" stroke="var(--color-secondary)" stroke-width="1.2" stroke-linecap="round" />
	<path d={string3} fill="none" stroke="var(--color-accent)" stroke-width="1.2" stroke-linecap="round" />
</svg>
