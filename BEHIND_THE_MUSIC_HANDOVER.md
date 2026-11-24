# Överlämning för Behind the Music

The Energy Hour-appen kan läsa sångtexter från spårlistan. **I collect** har kompletterats med en publicerbar textfil och fungerar som exempel för nästa låt. Den klickbara prototypen finns i samma repo som referens för Discover-panelens mobilflöde.

## Så använder appen innehållet

| Fil i repot | Funktion |
| --- | --- |
| [public/playlist.json](public/playlist.json) | Spårlistan. Hitta I collect via ID `2233811534`. Fältet `lyrics` har värdet `/lyrics/i-collect.txt`. |
| [public/lyrics/i-collect.txt](public/lyrics/i-collect.txt) | Sångtext i vanlig UTF-8. Produktionsanvisningarna är borttagna. Ordalydelse, radindelning och upprepningar är bevarade. |
| [public/playlist.schema.json](public/playlist.schema.json) | Schema för spårlistan. Fältet `lyrics` är en sökväg till en textfil eller en tom sträng. |
| [public/app.js](public/app.js) | Läser spellistan från `/playlist.json` och hämtar sångtexten från sökvägen i `lyrics`. |
| [index.html](index.html) | Innehåller den genererade spårraden och den indexerbara sångtexten. |

Om samma data används av en annan app ska sökvägen i `lyrics` lösas mot den origin där spellistan och textfilerna serveras. Visa texten som vanlig text och bevara radbrytningarna. Visa Lyrics när en text har kunnat hämtas. För I collect är `story` tomt, så Discover öppnar Lyrics först.

För att lägga till en text till ett befintligt spår, lägg textfilen i `public/lyrics/` och ange dess publika sökväg i rätt post i `public/playlist.json`. Kör `npm run build` för att generera om HTML och bygga sajten. Kör `npm run dev` för att prova Discover lokalt. Ändringen för I collect är committad i `83a555f` och produktionsbygget gick igenom.

## Klickbar design

Öppna [prototypens index.html](prototypes/behind-the-music-mobile/index.html) direkt i webbläsaren. Den visar Tokyo och Morning Can Wait. På mobilen öppnas Discover som en panel från skärmens nederkant, med Play vid låttiteln, flikarna Story, Lyrics och Info samt knappar för föregående och nästa låt. Panelen kan stängas med krysset eller genom att dra handtaget nedåt. Play simulerar uppspelning. Info länkar till SoundCloud och Spotify.

## Original och öppna kopplingar

- Originalet för **I collect** finns lokalt i `/Users/anders/Desktop/desktop/The Energy Hour 2024/I collect/I collect - text + arr.txt`.
- De 26 ursprungliga Markdown-filerna finns i `/Users/anders/Desktop/desktop/The Energy Hour 2024/Sångtexter/lyrics/`. Där finns också underlag för Tokyo och Morning Can Wait. För innehåll som ska visas i appen, använd textfilerna och metadata i repots `public/`.
- **It was you** har tre olika lokala textversioner. Bekräfta vilken som hör till inspelning `1968310423` före koppling i spellistan.
- **Feels like new** kan vara en version av **Varje morgon är du ny**. Bekräfta att inspelningen använder samma sångtext före återanvändning.
- [Tidigare innehållsöverlämning](TRACK_CONTENT_HANDOVER_RESULT.md) beskriver hur de övriga spåren och textfilerna kopplades.
