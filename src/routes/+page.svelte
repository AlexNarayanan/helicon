<script lang="ts">
	import { base } from '$app/paths';
</script>

<div class="max-w-2xl mx-auto text-center py-24">
	<h1 class="text-5xl font-bold mb-4" style="color: var(--color-text);">Helicon</h1>
	<p class="text-lg mb-8" style="color: var(--color-text-muted);">
		Your live music attendance tracker — every show, every setlist, every memory.
	</p>
	<a
		href="{base}/attendances/new"
		class="inline-block px-6 py-3 rounded font-semibold text-sm transition-all"
		style="background-color: var(--color-primary); color: var(--color-surface);"
	>
		Log a show
	</a>
</div>
