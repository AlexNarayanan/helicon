<script lang="ts">
	const TILE_W    = 1200;
	const NUM_TILES = 4;
	const WAVE_START = 540;
	const WAVE_END   = 640; // 100px active pulse

	// Four distinct waveform shapes — each is a list of [fraction, amplitude] waypoints
	const DESIGNS: [number, number][][] = [
		// 0: symmetric burst — up-down-up mirror, dense center
		[
			[0.00,  0.00],
			[0.07,  0.55], [0.11,  0.00], [0.15, -0.72], [0.19,  0.00],
			[0.23,  0.50], [0.27,  0.00], [0.31,  0.00],
			[0.36, -0.82], [0.40,  0.00], [0.44,  0.95], [0.48,  0.00],
			[0.50, -1.00],
			[0.52,  0.00], [0.56,  0.95], [0.60,  0.00], [0.64, -0.82], [0.68,  0.00],
			[0.72,  0.00],
			[0.77,  0.50], [0.81,  0.00], [0.85, -0.72], [0.89,  0.00],
			[0.93,  0.55], [1.00,  0.00],
		],
		// 1: build-spike-decay — quiet intro ripples, one dominant spike, trailing echo
		[
			[0.00,  0.00],
			[0.05,  0.40], [0.09,  0.00], [0.13, -0.52], [0.17,  0.00],
			[0.21,  0.35], [0.25,  0.00],
			[0.30,  0.90], [0.34,  0.00],
			[0.40, -1.00], [0.44,  0.00],
			[0.50,  0.78], [0.54,  0.00],
			[0.60,  0.00],
			[0.65, -0.62], [0.69,  0.00], [0.73,  0.44], [0.77,  0.00],
			[0.81, -0.32], [0.85,  0.00],
			[0.90,  0.22], [0.95,  0.00],
			[1.00,  0.00],
		],
		// 2: W-shape — twin peaks flanking a deep trough, with flanking ripples
		[
			[0.00,  0.00],
			[0.04,  0.42], [0.08,  0.00], [0.12, -0.58], [0.16,  0.00],
			[0.22,  0.72], [0.26,  0.00], [0.30,  0.88], [0.34,  0.00],
			[0.38, -0.52], [0.42,  0.00],
			[0.50, -1.00],
			[0.58,  0.00], [0.62, -0.52], [0.66,  0.00],
			[0.70,  0.88], [0.74,  0.00], [0.78,  0.72], [0.82,  0.00],
			[0.86, -0.58], [0.90,  0.00], [0.94,  0.42], [0.98,  0.00],
			[1.00,  0.00],
		],
		// 3: rapid stutter — dense alternating spikes of varying height
		[
			[0.00,  0.00],
			[0.04,  0.50], [0.08,  0.00], [0.12,  0.68], [0.16,  0.00],
			[0.20, -0.74], [0.24,  0.00], [0.28, -0.55], [0.32,  0.00],
			[0.36,  0.85], [0.40,  0.00],
			[0.44, -0.95], [0.48,  0.00],
			[0.52,  0.88], [0.56,  0.00],
			[0.60, -0.78], [0.64,  0.00], [0.68, -0.62], [0.72,  0.00],
			[0.76,  0.58], [0.80,  0.00], [0.84,  0.44], [0.88,  0.00],
			[0.93, -0.38], [1.00,  0.00],
		],
	];

	function ampAt(frac: number, design: [number, number][]): number {
		for (let i = 1; i < design.length; i++) {
			const [f0, a0] = design[i - 1];
			const [f1, a1] = design[i];
			if (frac <= f1) return a0 + ((frac - f0) / (f1 - f0)) * (a1 - a0);
		}
		return 0;
	}

	const VH = 520;

	const LINES: { y: number; shift: number; design: number }[] = [
		{ y: 0.09,  shift: 0,    design: 0 },
		{ y: 0.33,  shift: 680,  design: 1 },
		{ y: 0.61,  shift: 290,  design: 2 },
		{ y: 0.87,  shift: 1130, design: 3 },
	];

	const maxAmp = VH * 0.06;

	function makePath(cy: number, xShift: number, design: [number, number][]): string {
		const pts: string[] = [];
		for (let x = 0; x <= TILE_W * NUM_TILES; x += 3) {
			const xInTile = (x + xShift) % TILE_W;
			let y = cy;
			if (xInTile >= WAVE_START && xInTile <= WAVE_END) {
				const frac = (xInTile - WAVE_START) / (WAVE_END - WAVE_START);
				y = cy - ampAt(frac, design) * maxAmp;
			}
			pts.push(`${pts.length === 0 ? 'M' : 'L'}${x},${y.toFixed(1)}`);
		}
		return pts.join(' ');
	}

	const paths = LINES.map(l => makePath(l.y * VH, l.shift, DESIGNS[l.design]));
</script>

<style>
	.demo {
		position: relative;
		overflow: hidden;
		border-radius: 12px;
		border: 1px solid var(--color-border);
	}
	.bg-layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.wave-scroll {
		animation: wave-scroll 45s linear infinite;
		will-change: transform;
	}
	@keyframes wave-scroll {
		from { transform: translateX(0px); }
		to   { transform: translateX(-1200px); }
	}
	.content {
		position: relative;
		z-index: 1;
		padding: 1.5rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.mock-card {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		display: flex;
		gap: 1rem;
		align-items: center;
		width: fit-content;
	}
	.mock-bar { height: 8px; border-radius: 4px; background: var(--color-border); }
</style>

<div style="padding: 2rem; background: var(--color-surface); min-height: 100vh;">
	<div class="demo" style="height: {VH}px;">
		<div class="bg-layer">
			<div class="wave-scroll">
				<svg width={TILE_W * NUM_TILES} height={VH} xmlns="http://www.w3.org/2000/svg">
					{#each paths as d}
						<path {d} fill="none" stroke="var(--color-primary)"
							stroke-width="1.2" opacity="0.10" stroke-linejoin="miter" stroke-linecap="square" />
					{/each}
				</svg>
			</div>
		</div>
		<div class="content">
			{#each [120, 160, 95, 140] as w}
				<div class="mock-card">
					<div style="width:32px;height:32px;border-radius:6px;background:var(--color-border);"></div>
					<div style="display:flex;flex-direction:column;gap:6px;">
						<div class="mock-bar" style="width:{w}px;"></div>
						<div class="mock-bar" style="width:{w * 0.65}px;opacity:0.5;"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
