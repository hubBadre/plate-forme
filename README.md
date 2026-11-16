# Classe — plateforme de cours du soir

Application React/Vite en français pour les cours du Tronc Commun, 1BAC et 2BAC. Elle comprend des espaces professeur et élève, la validation des comptes, les classes, les LIVE LiveKit, les replays privés et les ressources PDF/exercices.

## Démarrer

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

L’application compile avec `npm run build`. Renseignez les variables de `.env.local`, puis relancez le serveur de développement.

## Configurer Supabase

1. Créez un projet Supabase et ajoutez `VITE_SUPABASE_URL` ainsi que `VITE_SUPABASE_PUBLISHABLE_KEY` à `.env.local`. Cette clé publique est protégée par RLS. Ne mettez jamais de clé `service_role` dans une variable `VITE_*`.
2. Exécutez `supabase/schema.sql` une seule fois dans le SQL Editor d’un nouveau projet. Les comptes Auth créés par invitation deviennent des profils élèves `pending`. Seuls les profils actifs approuvés voient les données privées.
3. Créez le premier compte administrateur depuis un canal de confiance : créez son compte Auth, puis définissez son profil comme `role='admin'`, `status='active'`, `approved_at=now()`. Ne permettez jamais de choisir un rôle dans un formulaire public.
4. Configurez l’envoi d’e-mails Auth (SMTP) pour que `admin-create-student` envoie les invitations. Le professeur peut créer une classe, inviter un élève dans celle-ci, valider ou suspendre les profils.
5. Le bucket `private-lessons` créé par le schéma est privé. Les vidéos et PDF sont téléversés dans ce bucket ; l’application crée seulement des URL signées valables cinq minutes après lecture d’une ligne autorisée.

## Configurer LiveKit et les enregistrements

Déployez les fonctions `live-token`, `live-recording` et `admin-create-student` avec Supabase CLI. La configuration locale impose la validation du JWT pour chaque fonction. Après avoir créé le projet Supabase et vous être authentifié avec la CLI, reliez le projet puis déployez les fonctions :

```powershell
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase functions deploy
```

Configurez ensuite leurs secrets côté serveur :

```powershell
supabase secrets set APP_ORIGIN=https://votre-domaine.example LIVEKIT_URL=wss://votre-instance.livekit.cloud LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
supabase secrets set STORAGE_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3 STORAGE_S3_ACCESS_KEY=... STORAGE_S3_SECRET_KEY=... STORAGE_S3_BUCKET=private-lessons STORAGE_S3_REGION=us-east-1
```

Créez des identifiants S3 dans les paramètres Storage de Supabase et accordez au compte d’enregistrement les droits d’écriture nécessaires sur `private-lessons`. Ces secrets ne vont jamais dans `.env.local` ni dans le navigateur. `live-token` ne délivre un jeton que pour un professeur hôte ou un élève approuvé membre de la classe. `live-recording` démarre et arrête LiveKit Egress dans le stockage privé.

## Fonctions incluses

- Invitations d’élèves, validation/suspension, création de classes.
- Planification et démarrage de LIVE, caméra, micro, partage d’écran, chat intégré, compteur de participants et enregistrement privé.
- Publication, filtrage, modification et suppression des replays ; URL vidéo signée à durée limitée.
- Téléversement, publication/dépublication, consultation et suppression de PDF, exercices et corrections.

Les tests de compilation sont exécutés localement. Les parcours Auth, LIVE et stockage ne peuvent être exercés de bout en bout qu’après création/configuration de vos projets Supabase et LiveKit.
