# Verifica della versione 1.0

- Build TypeScript e frontend completata.
- 11 test automatici superati: archivio, OAuth, streaming, albero, check, fonti, quiz ed estrazione PDF.
- Test completo della finestra desktop superato anche sul pacchetto finale Study.app: materia, PDF, mappa, check manuali, chat/reset, formule, quiz/correzione, esportazione e ripristino.
- Nei test desktop le risposte AI sono simulate esclusivamente nel processo di test.
- La prova con inferenza reale è predisposta in scripts/live-check.mjs ma non completata: l’istanza precedente mantiene aperto l’archivio. Il collegamento account era stato confermato dall’utente.
- PDF scansionati: immagine utilizzabile in chat; OCR automatico del corso non implementato.
- App locale macOS Apple Silicon, non notarizzata per distribuzione pubblica.
