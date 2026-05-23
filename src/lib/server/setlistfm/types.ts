export interface SetlistFmArtist {
	mbid: string;
	name: string;
	sortName: string;
	disambiguation?: string;
	url: string;
}

export interface SetlistFmCity {
	id: string;
	name: string;
	stateCode?: string;
	state?: string;
	coords?: {
		long: number;
		lat: number;
	};
	country: {
		code: string;
		name: string;
	};
}

export interface SetlistFmVenue {
	id: string;
	name: string;
	city: SetlistFmCity;
	url: string;
}

export interface SetlistFmSong {
	name: string;
	info?: string;
	cover?: SetlistFmArtist | null;
}

export interface SetlistFmSet {
	name?: string;
	encore?: number;
	song: SetlistFmSong[];
}

export interface SetlistFmSetlist {
	id: string;
	versionId: string;
	eventDate: string;
	lastUpdated: string;
	artist: SetlistFmArtist;
	venue: SetlistFmVenue;
	tour?: { name: string };
	sets: { set: SetlistFmSet[] };
	url: string;
}

export interface SearchArtistsResponse {
	artist: SetlistFmArtist[];
	total: number;
	page: number;
	itemsPerPage: number;
}

export interface SearchVenuesResponse {
	venue: SetlistFmVenue[];
	total: number;
	page: number;
	itemsPerPage: number;
}

export interface SearchSetlistsResponse {
	setlist: SetlistFmSetlist[];
	total: number;
	page: number;
	itemsPerPage: number;
}
