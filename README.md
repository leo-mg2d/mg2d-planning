# MG2D Sécurité — application en ligne V1

Cette version est une base réellement déployable. Elle utilise Supabase pour les comptes, la base de données et les autorisations, puis peut être hébergée comme site statique.

## Installation

1. Crée un projet Supabase.
2. Dans l’éditeur SQL, exécute `supabase-schema.sql`.
3. Dans Authentication > Users, crée ton compte administrateur et les comptes agents.
4. Pour chaque compte, ajoute une ligne dans `profiles` avec l’UUID du compte Auth.
5. Copie `config.example.js` vers `config.js`.
6. Ajoute l’URL du projet et la clé publique `anon`.
7. Ouvre `index.html` pour tester.
8. Déploie le dossier sur Vercel, Netlify ou un hébergement statique.

## Organisation de l’interface

Le planning se trouve directement sous le tableau de bord, comme demandé. Les agents voient leur propre planning et leurs demandes. L’administrateur voit tous les plannings et peut accepter ou refuser les congés.

## Modifications futures

Le code reste totalement modifiable. Chaque nouvelle version peut être testée avant publication, puis déployée sans supprimer les données Supabase.

## Sécurité

Ne mets jamais la clé `service_role` dans `config.js`. Seule la clé publique `anon` doit être utilisée dans le navigateur. Les règles RLS du fichier SQL limitent les données visibles selon le compte connecté.
