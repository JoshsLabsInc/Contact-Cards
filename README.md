# Folio contact studio

Open the [studio](https://joshslabsinc.github.io/Contact-Cards/), choose one contact file, and select **Create share link**. Each upload gets an independent link and downloadable QR. Recipients open a read-only card and select **Save to Contacts** to download the exact original vCard. On Android, choose Phone or Google when saving contacts with photos and multiple fields.

## Publishing

On the configured Windows computer, open **Open Folio Studio.cmd**. The local publisher uses the current Git Credential Manager login for this repository. It requires Node 20+ and Git. It accepts requests only from its own loopback page.

Other authorized publishers can use the hosted studio and provide their own fine-grained GitHub token with Contents read/write permission on this repository. The studio holds it only in tab memory and sends it only to GitHub's API. Recipients never need a token. Select a single-person .vcf of up to 2 MB.

## Storage and privacy

The browser encrypts the original bytes with a new AES-256-GCM key and writes the ciphertext into `cards/<random-id>.vcf.enc` on main. The unlock key travels in the fragment of the shared link. Names, filenames, contact fields, and keys are excluded from repository entries. Anyone with the full link or QR can read and download that card. Save the link or QR after publishing. Lost keys cannot be recovered from the repository. Publishing an updated file creates a new card.

The public viewer reads the encrypted file from GitHub and decrypts it on the recipient's device. Embedded images are displayed locally. Remote photos referenced by a vCard are preserved as references in the original file. There is no public card directory or profile edit endpoint. Previously shared links and downloaded files may persist in recipients' possession.

## Hosting

The `docs/` directory on main is published using GitHub Pages. No build or hosted backend is required. Serve the files over HTTPS or loopback for browser cryptography. The repository and public origin are configured in `card.js` and the local publisher.
