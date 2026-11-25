# Överlämning för låtberättelserna

The Energy Hour har nu korta berättelser för 47 av 64 spår. Den här omgången kompletterade eller utvecklade berättelsen för 27 spår i commit `2ff53df` (`Add track stories and document their sources`). Samtliga 32 spår med sångtext har nu också en berättelse.

## Filer och appintegration

| Fil | Innehåll |
| --- | --- |
| [public/playlist.json](public/playlist.json) | Appens spårdata. Varje kort berättelse finns i spårets befintliga `story`-fält. Använd spårets `id` för att hitta rätt post. En tom sträng betyder att spåret saknar berättelse. |
| [TRACK_STORY_SOURCES.md](TRACK_STORY_SOURCES.md) | Underlaget för de 27 uppdaterade spåren, med länkar till matchade låtchattar och uppgift om vilka berättelser som bygger på textläsning. |
| [index.html](index.html) | Genererat HTML-innehåll med de uppdaterade berättelserna. |

Discover läser `story` från spellistan. För sångtexterna hämtar appen textfilen som anges i `lyrics`. Se [överlämningen för Behind the Music](BEHIND_THE_MUSIC_HANDOVER.md) för sökvägar och ett konkret exempel med *I collect*.

## Så fortsätter du

1. Matcha källan till rätt spår-ID. Börja med Anders Mårténs egna synopsiser och anteckningar i låtchattarna. Originaltexterna ligger i `/Users/anders/Desktop/desktop/The Energy Hour 2024/Sångtexter/lyrics/`.
2. Skriv en kort story på låtens språk. Använd tillkomstuppgifter från dokumenterade källor. Om underlaget är själva texten, beskriv låtens scen eller tema och ange textläsning i källförteckningen.
3. Uppdatera `story` i spellistan och lägg till källan med spår-ID i källförteckningen. Kör `npm run build` för att generera om HTML. Kör `npm run dev` och öppna Discover för att granska berättelsen i appen.

## Kvar att bekräfta

- **It was you** (`1968310423)) har en story om det dokumenterade mötet på Café Bojan. Välj rätt av de tre lokala textversionerna innan `lyrics` fylls i.
- **Feels like new** (`2111051817`) har en story om kopplingen till den svenska bröllopssången. Bekräfta vad som sjungs i den publicerade Goa-versionen innan en textfil kopplas till spåret.

`npm run build` gick igenom för alla 64 spår. JSON jämfördes med föregående version och endast `story` ändrades. Alla befintliga referenser till sångtextfiler kontrollerades.
