import { asset } from "../../_shared/cdn";

type Characterprops = {
	name: string;
	image: string;
};

export const THUMBNAILS: Characterprops[] = [
	{
		name: "first",
		image: asset("jinlong/thumbnails-thumbnail-1"),
	},
	{
		name: "second",
		image: asset("jinlong/thumbnails-thumbnail-2"),
	},
	{
		name: "third",
		image: asset("jinlong/thumbnails-thumbnail-3"),
	},
];
export const CHARACTERS = [
	asset("jinlong/characters-character-1"),
	asset("jinlong/characters-character-2"),
	asset("jinlong/characters-character-3"),
];
