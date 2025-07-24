import { SongDataShort } from "../types/songData";
import queue from "./queue";
import { SongInfo } from "../types/songInfo";
import { stat, write, writeFileSync } from "fs";
import mpd, { MPD_ALBUM_CLIENT, MPD_CLIENT, MPD_CONNECTED } from "./mpd/mpd";
import { mainWindow } from "..";
import tidal from "./tidal/tidal";
import config from "../config/config";
import { PlaylistData, PlaylistDataShort } from "../types/playlistDataShort";
import yt from "./yt/yt";
import spotify from "./spotify/spotify";

let lastSongChange: number = Date.now();
let playlistList: Array<PlaylistDataShort> = [];
let playlistDatas: Map<string, PlaylistData> = new Map();

export interface PlayerState {
    playing: boolean;
    playSource: string;
};

let playerState: PlayerState = {
    playing: false,
    playSource: '',
};

function updatePlayerState(info: SongInfo) {
    playerState.playing = info.playing;
}

function getPlayerState() {
    return playerState;
}

function getCurrentSong(): Promise<SongInfo> {
    return new Promise<SongInfo>(
        async (res, rej) => {
            {
                let promise;

                if (playerState.playSource == 'mpd')
                    promise = mpd.getPlayState();
                else if (playerState.playSource == 'tidal')
                    promise = tidal.getPlayState()
                else if (playerState.playSource == 'yt')
                    promise = yt.getPlayState()
                else if (playerState.playSource == 'spotify')
                    promise = spotify.getPlayState()
                else {
                    rej();
                    return;
                }

                promise.then(
                    (data) => {
                        // if we are less than a second to the end, set a timeout for playing the next song.
                        // This sucks, but oh well.
                        if (data.totalSeconds - data.elapsedSeconds < 1 && Date.now() - 2000 > lastSongChange) {
                            lastSongChange = Date.now();
                            setTimeout(() => {
                                onSongEnded();
                            }, (data.totalSeconds - data.elapsedSeconds) * 1000 + 50 /* 50ms of headroom? */);
                        }

                        updatePlayerState(data);
                        res(data);
                    }
                )
            }
        }
    );

}

async function pausePlay(play: boolean): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            if (playerState.playSource == "mpd")
                mpd.pausePlay(play).then((e) => { res(e) });
            else if (playerState.playSource == "tidal")
                tidal.pausePlay(play).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (playerState.playSource == "yt")
                yt.pausePlay(play).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (playerState.playSource == "spotify")
                spotify.pausePlay(play).then((e) => { res(e) }).catch((e) => { res(false); });

            res(false);
        }
    );
}

async function playNextPrev(next: boolean): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            getCurrentSong().then(
                (data) => {
                    const QUEUE = queue.get();
                    const IDX = queue.getCurrentIdx();

                    if (next) {
                        if (QUEUE.length > IDX + 1) {
                            queue.setCurrentIdx(IDX + 1);
                            playSong(QUEUE[IDX + 1].identifier, QUEUE[IDX + 1].source).then(() => {
                                res(true);
                            });
                        }
                    } else {
                        if (data.elapsedSeconds >= 10 || IDX == 0) {
                            queue.setCurrentIdx(IDX);
                            seekCurrentSong(0).then(() => {
                                res(true);
                            });
                        } else {
                            queue.setCurrentIdx(IDX - 1);
                            playSong(QUEUE[IDX - 1].identifier, QUEUE[IDX - 1].source).then(() => {
                                res(true);
                            });
                        }
                    }
                }
            )
        }
    );
}

async function playSong(identifier: string, source: string): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            lastSongChange = Date.now();

            setVolume(config.getConfigValue("volume"));

            if (playerState.playSource != source)
                pausePlay(false);

            playerState.playSource = source;

            if (source == "mpd")
                mpd.play(identifier).then((e) => { res(e) });
            else if (source == "tidal")
                tidal.play(identifier).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (source == "yt")
                yt.play(identifier).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (source == "spotify")
                spotify.play(identifier).then((e) => { res(e) }).catch((e) => { res(false); });

            res(false);
        }
    );
}

async function songFromID(identifier: string, source: string): Promise<SongDataShort> {
    return new Promise<SongDataShort>(
        async (res) => {
            let data: SongDataShort = {
                identifier: identifier,
                source: source,
                title: "Unknown title",
                artistString: "",
                artists: [],
                album: "",
                duration: 0,
            };

            if (source == "mpd")
                mpd.songFromID(identifier).then((e) => { res(e) });
            else if (source == "tidal")
                tidal.songFromID(identifier).then((e) => { res(e) }).catch((e) => { res(data); });
            else if (source == "yt")
                yt.songFromID(identifier).then((e) => { res(e) }).catch((e) => { res(data); });
            else if (source == "spotify")
                spotify.songFromID(identifier).then((e) => { res(e) }).catch((e) => { res(data); });
            else
                res(data);
        }
    );
}

async function seekCurrentSong(seconds: number): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            if (playerState.playSource == "mpd")
                mpd.seek(seconds).then((e) => { res(e) });
            else if (playerState.playSource == "tidal")
                tidal.seek(seconds).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (playerState.playSource == "yt")
                yt.seek(seconds).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (playerState.playSource == "spotify")
                spotify.seek(seconds).then((e) => { res(e) }).catch((e) => { res(false); });

            res(false);
        }
    );
}

async function setVolume(vol: number): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            if (playerState.playSource == "mpd")
                mpd.setVolume(vol).then((e) => { res(e) });
            else if (playerState.playSource == "tidal")
                tidal.setVolume(vol).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (playerState.playSource == "yt")
                yt.setVolume(vol).then((e) => { res(e) }).catch((e) => { res(false); });
            else if (playerState.playSource == "spotify")
                spotify.setVolume(vol).then((e) => { res(e) }).catch((e) => { res(false); });
            else
                res(false);
        }
    );
}

async function onSongEnded() {
    const QUEUE = queue.get();
    const IDX = queue.getCurrentIdx();

    if (QUEUE.length > IDX + 1) {
        queue.setCurrentIdx(IDX + 1);
        playSong(QUEUE[IDX + 1].identifier, QUEUE[IDX + 1].source).then(() => {
            getCurrentSong().then((msg) => {
                mainWindow.webContents.send('updateCurrentSong', msg);
            });
        })
    }
}

async function initPlayer() {
    lastSongChange = Date.now();
}

let tidalGotPlaylists = false;
let spotifyGotPlaylists = false;

let playlists: Array<PlaylistDataShort> = [];
let tidalPlaylists: Array<PlaylistDataShort> = [];
let spotifyPlaylists: Array<PlaylistDataShort> = [];

async function updatePlaylists() {
    console.log("updating playlists")

    if (!tidalGotPlaylists) {
        tidal.getPlaylists().then((res) => {
            tidalPlaylists = res;
            playlists = tidalPlaylists.concat(spotifyPlaylists);
            mainWindow.webContents.send('updatePlaylists', playlists);
            tidalGotPlaylists = true;
        }).catch(() => { });
    }

    if (!spotifyGotPlaylists) {
        spotify.getPlaylists().then((res) => {
            spotifyPlaylists = res;
            playlists = tidalPlaylists.concat(spotifyPlaylists);
            mainWindow.webContents.send('updatePlaylists', playlists);
            spotifyGotPlaylists = true;
        }).catch(() => { });
    }

    mainWindow.webContents.send('updatePlaylists', playlists);
}

function uncachePlaylist(playlist: PlaylistDataShort) {
    if (playlistDatas.has(playlist.source + "_" + playlist.identifier))
        playlistDatas.delete(playlist.source + "_" + playlist.identifier);
}

async function removeFromPlaylist(song: SongDataShort, playlist: PlaylistDataShort): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            if (playlist.source == "mpd")
                res(false); // TODO:
            else if (playlist.source == "tidal")
                tidal.removeFromPlaylist(song, playlist).then((e) => {
                    res(true);
                }).catch((e) => { res(false); });
            else if (playlist.source == "spotify")
                res(false);
            else
                res(false);
        }
    );
}

async function addToPlaylist(song: SongDataShort, playlist: PlaylistDataShort): Promise<boolean> {
    return new Promise<boolean>(
        async (res) => {
            if (song.source != playlist.source) {
                res(false);
                return;
            }

            if (playlist.source == "mpd")
                res(false); // TODO:
            else if (playlist.source == "tidal")
                tidal.addToPlaylist(song, playlist).then((e) => {
                    res(true);
                }).catch((e) => { res(false); });
            else if (playlist.source == "spotify")
                res(false);
            else
                res(false);
        }
    );
}

async function getPlaylistData(playlist: PlaylistDataShort): Promise<PlaylistData> {
    return new Promise<PlaylistData>(
        async (res) => {
            if (playlistDatas.has(playlist.source + "_" + playlist.identifier)) {
                const data = playlistDatas.get(playlist.source + "_" + playlist.identifier);
                if (data.gatheredAt + 1000 * 60 * 2 /* 2 mins */ > new Date().getTime()) {
                    res(playlistDatas.get(playlist.source + "_" + playlist.identifier));
                    return;
                }
            }

            if (playlist.source == "mpd")
                res({}); // TODO:
            else if (playlist.source == "tidal")
                tidal.getPlaylistData(playlist).then((e) => {
                    e.gatheredAt = new Date().getTime();
                    playlistDatas.set(playlist.source + "_" + playlist.identifier, e);
                    res(e);
                }).catch((e) => { res({}); });
            else if (playlist.source == "spotify")
                spotify.getPlaylistData(playlist).then((e) => {
                    e.gatheredAt = new Date().getTime();
                    playlistDatas.set(playlist.source + "_" + playlist.identifier, e);
                    res(e);
                }).catch((e) => { res({}); });
            else
                res({});
        }
    );
}

export default {
    getPlayerState,
    getCurrentSong,
    pausePlay,
    playNextPrev,
    playSong,
    songFromID,
    seekCurrentSong,
    setVolume,
    onSongEnded,
    initPlayer,
    updatePlaylists,
    getPlaylistData,
    removeFromPlaylist,
    addToPlaylist,
    uncachePlaylist,
};
