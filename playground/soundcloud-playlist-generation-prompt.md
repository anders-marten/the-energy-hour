# SoundCloud playlist generation prompt

Use this prompt to regenerate `public/playlist.json` from a SoundCloud profile.

```text
Scrape the SoundCloud profile at:
https://soundcloud.com/the_energy_hour

Generate a `playlist.json` file for the web page. The JSON must be an array of objects with this shape:

[
  {
    "title": "Track title",
    "id": "SoundCloud track id"
  }
]

Include every public track that belongs to the SoundCloud profile user `The Energy Hour`, including tracks whose metadata artist is `FUNKMA` or a collaboration/remix, as long as the track is published on the `the_energy_hour` SoundCloud profile.

Use the numeric SoundCloud track id, because the site builds embeds with:

https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/{TRACK_ID}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=true&show_user=true&show_reposts=false&show_teaser=false&visual=true

Do not include playlist ids, user ids, reposts, likes, or external tracks from other profiles. Output only valid formatted JSON.
```
