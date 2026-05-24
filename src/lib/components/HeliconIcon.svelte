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

	const STRING_CENTERS = [0.16, 0.30, 0.50, 0.70, 0.84];
	const STRING_COLORS = [
		'var(--color-primary)',
		'var(--color-secondary)',
		'var(--color-accent)',
		'var(--color-secondary)',
		'var(--color-primary)'
	];

	function stringPath(cy: number, index: number): string {
		const steps = 28;
		const pts: string[] = [];
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const x = size * 0.07 + t * (size * 0.83);
			const y = cy * size + Math.sin(t * Math.PI * 3 + phase + index * Math.PI / 2.5) * size * 0.010;
			pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
		}
		return pts.join(' ');
	}

	const strings = $derived(STRING_CENTERS.map((cy, i) => stringPath(cy, i)));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	xmlns="http://www.w3.org/2000/svg"
	aria-label="Helicon"
	role="img"
>
	<!-- nut -->
	<line
		x1={size * 0.90} y1={size * 0.16}
		x2={size * 0.90} y2={size * 0.84}
		stroke="var(--color-primary)"
		stroke-width={size * 0.050}
		stroke-linecap="round"
	/>
	<!-- fret lines -->
	<line x1={size*0.69} y1={size*0.16} x2={size*0.69} y2={size*0.84}
		stroke="var(--color-primary)" stroke-width={size*0.022} stroke-linecap="round" opacity="0.45" />
	<line x1={size*0.48} y1={size*0.16} x2={size*0.48} y2={size*0.84}
		stroke="var(--color-primary)" stroke-width={size*0.022} stroke-linecap="round" opacity="0.45" />
	<line x1={size*0.27} y1={size*0.16} x2={size*0.27} y2={size*0.84}
		stroke="var(--color-primary)" stroke-width={size*0.022} stroke-linecap="round" opacity="0.45" />
	<!-- animated strings -->
	{#each strings as d, i}
		<path {d} fill="none" stroke={STRING_COLORS[i]} stroke-width={size * 0.030} stroke-linecap="round" />
	{/each}
</svg>
