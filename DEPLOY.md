# Kako objaviti aplikaciju na GitHub Pages

Ova aplikacija je spremna za rad na GitHub Pages. Pošto se radi o **React (Vite)** aplikaciji, pratite ove korake:

## 1. Priprema repozitorija
- Napravite novi repozitorij na GitHubu (npr. `trig-obrazac-1`).
- Povežite vaš lokalni kod sa tim repozitorijem.

## 2. Podešavanje putanje (Base Path)
U fajlu `vite.config.ts` sam dodao podršku za `VITE_BASE_PATH`. 
Ako se vaš repozitorij zove `trig-obrazac-1`, vaša aplikacija će biti na:
`https://vas-username.github.io/trig-obrazac-1/`

## 3. Automatska objava (Najlakši način)
Najbolje je koristiti **GitHub Actions**. Kreirajte fajl na ovoj putanji u vašem projektu:
`.github/workflows/deploy.yml`

U taj fajl zalijepite sljedeći sadržaj:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ] # ili master, zavisno kako se zove vaša glavna grana

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install and Build
        run: |
          npm install
          npm run build
        env:
          VITE_BASE_PATH: /trig-obrazac-1/ # Ovdje stavite ime vašeg repozitorija!

      - name: Deploy
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          folder: dist # Vite stavlja build u ovaj folder
          branch: gh-pages # Grana na koju se objavljuje
```

## 4. Aktiviranje na GitHubu (VAŽNO!)
1. Uradite `git push` na vaš `main` branch.
2. **DOZVOLE:** Na GitHubu idite na **Settings** -> **Actions** -> **General**.
   - Skrolujte do dna do **Workflow permissions**.
   - Odaberite **Read and write permissions** i kliknite **Save**.
3. **PAGES:** Idite na **Settings** -> **Pages**.
   - Pod **Build and deployment** -> **Source**, odaberite **Deploy from a branch**.
   - Odaberite granu `gh-pages` i folder `/ (root)`.
4. Sačekajte par minuta i vaša aplikacija će biti uživo!

---
**Napomena:** Aplikacija koristi `localStorage` za čuvanje podataka, tako da će sve raditi direktno u browseru bez potrebe za serverom.
