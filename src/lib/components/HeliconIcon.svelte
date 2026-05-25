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

	onMount(() => { raf = requestAnimationFrame(tick); });
	onDestroy(() => { if (browser) cancelAnimationFrame(raf); });

	// ── Design constants (fractions of `size` = icon height) ──────────────────
	const NUT_X       = 1.10;
	const STR_START_X = 0.04;
	const VIEW_W_FRAC = 2.96;
	const NECK_TOP_Y  = 0.09;
	const NECK_BOT_Y  = 0.91;

	// 6 strings evenly spaced inside the neck borders
	const STRING_CENTERS = [0.16, 0.296, 0.432, 0.568, 0.704, 0.84];
	const STRING_COLORS = [
		'var(--color-primary)',
		'var(--color-secondary)',
		'var(--color-accent)',
		'var(--color-accent)',
		'var(--color-secondary)',
		'var(--color-primary)',
	];

	// 4 fret lines spanning neck borders
	const FRET_X = [0.89, 0.68, 0.47, 0.26];

	// ── Headstock shape (Ibanez-inspired blade, rounded corners) ──────────────
	// Vertices as fractions of size:
	//   nutTop ─────────────────────── farTop
	//     │  long flat top (peg side)      \  short steep drop
	//     │                               TIP (sharp point)
	//     │  long aggressive diagonal      /
	//   nutBot ─────────────────────────/
	const V: Record<string, [number, number]> = {
		nutTop: [NUT_X, 0.05],
		farTop: [2.62,  0.03],
		tip:    [2.84,  0.40],
		nutBot: [NUT_X, 0.95],
	};

	function unitVec(ax: number, ay: number, bx: number, by: number): [number, number] {
		const len = Math.hypot(bx - ax, by - ay);
		return [(bx - ax) / len, (by - ay) / len];
	}

	const U = {
		top:  unitVec(...V.nutTop, ...V.farTop),
		drop: unitVec(...V.farTop, ...V.tip),
		back: unitVec(...V.tip,    ...V.nutBot),
		left: unitVec(...V.nutBot, ...V.nutTop),
	};

	// Compute the arrive / ctrl / depart points for one rounded corner
	function cornerPts(vx: number, vy: number, inU: [number, number], outU: [number, number], r: number) {
		return {
			arrive: [vx - r * inU[0],  vy - r * inU[1]]  as [number, number],
			ctrl:   [vx,               vy]                as [number, number],
			depart: [vx + r * outU[0], vy + r * outU[1]] as [number, number],
		};
	}

	const R  = 0.07;   // main corner radius
	const Rt = 0.035;  // tip radius (smaller keeps it pointy)
	const TL = cornerPts(...V.nutTop, U.left,  U.top,  R);
	const TR = cornerPts(...V.farTop, U.top,   U.drop, R);
	const TP = cornerPts(...V.tip,    U.drop,  U.back, Rt);
	const BL = cornerPts(...V.nutBot, U.back,  U.left, R);

	function headstockPath(): string {
		const p = ([x, y]: [number, number]) =>
			`${(x * size).toFixed(2)},${(y * size).toFixed(2)}`;
		return [
			`M ${p(TL.arrive)}`,
			`Q ${p(TL.ctrl)} ${p(TL.depart)}`,
			`L ${p(TR.arrive)}`,
			`Q ${p(TR.ctrl)} ${p(TR.depart)}`,
			`L ${p(TP.arrive)}`,
			`Q ${p(TP.ctrl)} ${p(TP.depart)}`,
			`L ${p(BL.arrive)}`,
			`Q ${p(BL.ctrl)} ${p(BL.depart)}`,
			'Z',
		].join(' ');
	}

	// ── Inline tuning pegs: 6 in a single horizontal row ──────────────────────
	// String 0 (top) → nearest peg; string 5 (bottom) → farthest.
	// Strings fan from their nut y-positions up to the peg line.
	const PEG_Y  = 0.185;
	const PEG_X0 = 1.26;
	const PEG_DX = (2.36 - PEG_X0) / 5;  // 6 pegs, 5 gaps
	const PEGS = STRING_CENTERS.map((strY, i) => ({
		px: PEG_X0 + i * PEG_DX,
		py: PEG_Y,
		strY,
	}));

	const PEG_R     = 0.058;
	const PEG_INNER = 0.025;

	// ── Animated string paths (neck portion only) ──────────────────────────────
	function stringPath(cy: number, index: number): string {
		const steps = 30;
		const pts: string[] = [];
		const startX = size * STR_START_X;
		const endX   = size * NUT_X;
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const x = startX + t * (endX - startX);
			const y = cy * size + Math.sin(t * Math.PI * 3 + phase + index * Math.PI / 2.5) * size * 0.009;
			pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
		}
		return pts.join(' ');
	}

	const strings = $derived(STRING_CENTERS.map((cy, i) => stringPath(cy, i)));
	const hsPath  = $derived(headstockPath());
	const viewW   = $derived(size * VIEW_W_FRAC);
</script>

<svg
	width={viewW}
	height={size}
	viewBox="0 0 {viewW} {size}"
	xmlns="http://www.w3.org/2000/svg"
	aria-label="Helicon"
	role="img"
>
	<!-- headstock body -->
	<path
		d={hsPath}
		fill="var(--color-surface)"
		stroke="var(--color-primary)"
		stroke-width={size * 0.028}
		stroke-linejoin="round"
	/>

	<!-- neck top border -->
	<line
		x1={size * STR_START_X} y1={size * NECK_TOP_Y}
		x2={size * NUT_X}       y2={size * NECK_TOP_Y}
		stroke="var(--color-primary)"
		stroke-width={size * 0.026}
		stroke-linecap="round"
		opacity="0.60"
	/>
	<!-- neck bottom border -->
	<line
		x1={size * STR_START_X} y1={size * NECK_BOT_Y}
		x2={size * NUT_X}       y2={size * NECK_BOT_Y}
		stroke="var(--color-primary)"
		stroke-width={size * 0.026}
		stroke-linecap="round"
		opacity="0.60"
	/>

	<!-- fret lines (span the neck borders) -->
	{#each FRET_X as fx}
		<line
			x1={size * fx} y1={size * NECK_TOP_Y}
			x2={size * fx} y2={size * NECK_BOT_Y}
			stroke="var(--color-primary)"
			stroke-width={size * 0.020}
			stroke-linecap="round"
			opacity="0.45"
		/>
	{/each}

	<!-- nut -->
	<line
		x1={size * NUT_X} y1={size * NECK_TOP_Y}
		x2={size * NUT_X} y2={size * NECK_BOT_Y}
		stroke="var(--color-primary)"
		stroke-width={size * 0.048}
		stroke-linecap="round"
	/>

	<!-- headstock strings: static fan from nut to peg row -->
	{#each PEGS as peg, i}
		<line
			x1={size * NUT_X}  y1={peg.strY * size}
			x2={peg.px * size} y2={peg.py   * size}
			stroke={STRING_COLORS[i]}
			stroke-width={size * 0.016}
			opacity="0.65"
		/>
	{/each}

	<!-- animated neck strings -->
	{#each strings as d, i}
		<path
			{d}
			fill="none"
			stroke={STRING_COLORS[i]}
			stroke-width={size * 0.026}
			stroke-linecap="round"
		/>
	{/each}

	<!-- tuning pegs (outer button + inner hole) -->
	{#each PEGS as peg, i}
		<circle
			cx={peg.px * size} cy={peg.py * size}
			r={size * PEG_R}
			fill={STRING_COLORS[i]}
			opacity="0.95"
		/>
		<circle
			cx={peg.px * size} cy={peg.py * size}
			r={size * PEG_INNER}
			fill="var(--color-surface)"
			opacity="0.85"
		/>
	{/each}
</svg>
