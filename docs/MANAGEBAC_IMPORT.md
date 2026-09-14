# Import authorized ManageBac class files

AI-for-IB and the companion `DH4410/managebac-mcp` repository intentionally keep authentication and study-data storage separate.

The ManageBac MCP owns the authenticated browser session. AI-for-IB receives only a path to a local file that the user has already been allowed to access normally.

## 1. Update and restart the ManageBac MCP

Use the latest `main` from:

```text
https://github.com/DH4410/managebac-mcp
```

After updating, rebuild and restart/reconnect the MCP process so the new tools are visible:

```bash
npm ci
npm run build
npm start
```

If the saved manual session is missing or expired, use the existing normal login flow:

```bash
npm run login
```

Do not copy its `.env`, browser storage state, password, cookies or session files into AI-for-IB.

## 2. Discover the class

From the MCP client:

```text
managebac_get_classes()
```

Select the Physics, Chemistry or Mathematics class.

## 3. List class resources

```text
managebac_get_class_files({
  "className": "Physics"
})
```

The result contains safe resource metadata and an opaque `resourceId`. It does not expose the underlying download URL.

If a resource is not listed, the current bridge did not find a normal downloadable same-origin resource on the class pages it inspected. Do not work around access controls; inspect the class normally and improve the resource discovery code if needed.

## 4. Download one discovered resource

```text
managebac_download_file({
  "resourceId": "<id returned above>"
})
```

The MCP server uses its already-authenticated Playwright context, starts from the configured ManageBac origin, follows the normal download response, rejects HTML pages, enforces a size limit, computes SHA-256, and writes the file under ignored private storage:

```text
managebac-mcp/.managebac/downloads/
```

The response includes `localPath`, `filename`, `mimeType`, `byteCount`, and `sha256`.

## 5. Match the file to AI-for-IB source metadata

If it is one of the known textbook records, use the matching source ID:

| Subject | Source ID |
| --- | --- |
| Chemistry | `chemistry-pearson-2025` |
| Physics | `physics-oxford-2023` |
| Mathematics AA HL | `mathematics-aa-hl-higher-book` |

If it is a different class resource, create a **private** metadata inventory outside public Git and pass it through `--inventory`. Do not commit student-specific class/resource metadata unless it is intentionally safe to publish.

## 6. Ingest the local downloaded file

Example:

```powershell
npx tsx scripts/ingest-source.ts `
  --source-id physics-oxford-2023 `
  --input "C:\path\to\managebac-mcp\.managebac\downloads\<sha>--PhysicsBook.pdf"
```

For a private custom inventory:

```powershell
npx tsx scripts/ingest-source.ts `
  --source-id my-private-class-resource `
  --input "C:\path\to\.managebac\downloads\<file>" `
  --inventory "C:\private\ai-for-ib-source-inventory.json"
```

## 7. Inspect and index

Review page count/OCR-required pages and then:

```bash
npm run verify:private
npm run study:index -- --source-id physics-oxford-2023
```

Use `--inventory <private-json>` on the ingestion command when the source is not in the public example inventory. The indexing command currently expects the same inventory when resolving source metadata; pass `--inventory <private-json>` there as well.

## Security boundary

- No ManageBac credential/session state is copied into this repo.
- No arbitrary URL is accepted by the MCP download tool.
- Downloaded files stay under ignored private storage.
- AI-for-IB rematerializes the file into its own immutable private source store before extraction.
- Raw PDFs/extracted text remain outside public Git.
- This workflow uses only files the logged-in student can access through the normal ManageBac experience.
