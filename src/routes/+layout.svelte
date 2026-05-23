<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applyTheme, loadTheme, saveTheme, THEMES, THEME_LABELS, type Theme } from '$lib/themes';
	import HeliconIcon from '$lib/components/HeliconIcon.svelte';

	let { children } = $props();

	let currentTheme: Theme = $state('mythos');

	onMount(() => {
		currentTheme = loadTheme();
		applyTheme(currentTheme);
	});

	function setTheme(theme: Theme) {
		currentTheme = theme;
		applyTheme(theme);
		saveTheme(theme);
	}
</script>

<div class="min-h-screen" style="background-color: var(--color-surface);">
	<header
		class="flex items-center justify-between border-b px-6 py-3"
		style="border-color: var(--color-border);"
	>
		<a href="/" class="flex items-center gap-3 no-underline">
			<HeliconIcon size={36} />
			<span class="text-xl font-bold tracking-tight" style="color: var(--color-text);">
				Helicon
			</span>
		</a>

		<nav class="flex items-center gap-6">
			<a
				href="/attendances"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Shows
			</a>
			<a
				href="/viz/timeline"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Timeline
			</a>
			<a
				href="/viz/map"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Map
			</a>
			<a
				href="/reports"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Reports
			</a>

			<div class="ml-4 flex items-center gap-1">
				{#each THEMES as theme}
					<button
						onclick={() => setTheme(theme)}
						title={THEME_LABELS[theme]}
						class="h-5 w-5 rounded-full border-2 transition-all"
						style="background-color: var(--color-primary); border-color: {currentTheme === theme
							? 'var(--color-text)'
							: 'transparent'};"
						data-theme-swatch={theme}
					></button>
				{/each}
			</div>
		</nav>
	</header>

	<main class="px-6 py-8">
		{@render children()}
	</main>
</div>
