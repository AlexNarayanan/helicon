<script lang="ts">
	import { base } from '$app/paths';

	type Phase = 'idle' | 'uploading' | 'streaming' | 'done' | 'error';

	type RowEvent = {
		type: 'row';
		status: 'ok' | 'not_found' | 'error';
		line: number;
		artist: string;
		date: string;
		venue: string;
		performanceCount?: number;
		showId?: number;
		attendanceId?: number;
		reason?: string;
	};

	type MalformedEvent = {
		type: 'malformed';
		line: number;
		raw: string;
		reason: string;
	};

	type StartEvent = { type: 'start'; totalRows: number; malformedCount: number };

	type SummaryEvent = {
		type: 'summary';
		total: number;
		ok: number;
		notFound: number;
		error: number;
		malformed: number;
		successRate: number;
	};

	type LogLine = RowEvent | MalformedEvent | StartEvent | SummaryEvent;

	let file = $state<File | null>(null);
	let phase = $state<Phase>('idle');
	let errorMsg = $state('');
	let logs = $state<LogLine[]>([]);
	let summary = $state<SummaryEvent | null>(null);
	let totalRows = $state(0);
	let progress = $derived(
		logs.filter((l) => l.type === 'row' || l.type === 'malformed').length
	);

	function onFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		file = target.files?.[0] ?? null;
	}

	async function submit() {
		if (!file) return;
		phase = 'uploading';
		errorMsg = '';
		logs = [];
		summary = null;
		totalRows = 0;

		const form = new FormData();
		form.append('file', file);

		try {
			const res = await fetch(`${base}/api/import`, { method: 'POST', body: form });
			if (!res.ok || !res.body) {
				throw new Error(`upload failed: ${res.status} ${await res.text()}`);
			}
			phase = 'streaming';

			const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = '';
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += value;
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.trim()) continue;
					const event = JSON.parse(line) as LogLine;
					if (event.type === 'start') {
						totalRows = event.totalRows;
					} else if (event.type === 'summary') {
						summary = event;
					}
					logs = [...logs, event];
				}
			}
			phase = 'done';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			phase = 'error';
		}
	}

	function badge(status: 'ok' | 'not_found' | 'error' | 'malformed'): {
		text: string;
		color: string;
	} {
		switch (status) {
			case 'ok':
				return { text: '✓', color: '#16a34a' };
			case 'not_found':
				return { text: '✗', color: '#f59e0b' };
			case 'error':
				return { text: '!', color: '#ef4444' };
			case 'malformed':
				return { text: '⚠', color: '#a1a1aa' };
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<h1 class="mb-2 text-3xl font-bold" style="color: var(--color-text);">Bulk import</h1>
	<p class="mb-6 text-sm" style="color: var(--color-text-muted);">
		Upload a pipe-delimited file of shows. Each row must have at least
		<code>date|artist|openers|venue</code>; extra columns are ignored. Each show is matched against
		setlist.fm and saved as a confirmed attendance.
	</p>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
		class="mb-6 flex items-center gap-3"
	>
		<input
			type="file"
			accept=".tsv,.csv,.txt"
			onchange={onFileChange}
			class="text-sm"
			style="color: var(--color-text);"
		/>
		<button
			type="submit"
			disabled={!file || phase === 'uploading' || phase === 'streaming'}
			class="rounded px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
			style="background: var(--color-primary); color: var(--color-surface);"
		>
			{phase === 'uploading' ? 'Uploading…' : phase === 'streaming' ? 'Importing…' : 'Import'}
		</button>
	</form>

	{#if phase === 'error'}
		<div class="mb-4 rounded border px-4 py-3 text-sm" style="border-color: #ef4444; color: #ef4444;">
			{errorMsg}
		</div>
	{/if}

	{#if phase === 'streaming' && totalRows > 0}
		<div class="mb-4 text-sm" style="color: var(--color-text-muted);">
			Processed {progress} / {totalRows + (logs.filter((l) => l.type === 'malformed').length)}
		</div>
	{/if}

	{#if summary}
		<div
			class="mb-4 rounded border px-4 py-3"
			style="border-color: var(--color-border); background: var(--color-surface);"
		>
			<div class="mb-1 text-lg font-semibold" style="color: var(--color-text);">
				{(summary.successRate * 100).toFixed(1)}% success
			</div>
			<div class="text-sm" style="color: var(--color-text-muted);">
				{summary.ok} imported · {summary.notFound} not found · {summary.error} errors ·
				{summary.malformed} malformed · {summary.total} total rows
			</div>
		</div>
	{/if}

	{#if logs.length > 0}
		<div
			class="overflow-hidden rounded border"
			style="border-color: var(--color-border);"
		>
			<ul class="max-h-[60vh] overflow-y-auto font-mono text-xs">
				{#each logs as event, idx (idx)}
					{#if event.type === 'row'}
						{@const b = badge(event.status)}
						<li class="border-b px-3 py-2" style="border-color: var(--color-border);">
							<span style="color: {b.color}; font-weight: bold;">{b.text}</span>
							<span style="color: var(--color-text-muted);">L{event.line}</span>
							<span style="color: var(--color-text);">{event.date}</span>
							<span style="color: var(--color-text);">· {event.artist}</span>
							<span style="color: var(--color-text-muted);">@ {event.venue}</span>
							{#if event.status === 'ok'}
								<span style="color: var(--color-text-muted);">
									→ #{event.attendanceId} ({event.performanceCount} performances)
								</span>
							{:else}
								<div class="ml-4 mt-0.5" style="color: var(--color-text-muted);">{event.reason}</div>
							{/if}
						</li>
					{:else if event.type === 'malformed'}
						{@const b = badge('malformed')}
						<li class="border-b px-3 py-2" style="border-color: var(--color-border);">
							<span style="color: {b.color}; font-weight: bold;">{b.text}</span>
							<span style="color: var(--color-text-muted);">L{event.line}</span>
							<span style="color: var(--color-text);">malformed: {event.reason}</span>
							<div class="ml-4 mt-0.5" style="color: var(--color-text-muted);">{event.raw}</div>
						</li>
					{/if}
				{/each}
			</ul>
		</div>
	{/if}
</div>
