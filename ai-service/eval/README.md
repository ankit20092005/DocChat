# Evaluate retrieval on your PDFs

The baseline calls the same `app.retrieval.retrieve(db, models, index, ask)` function as FastAPI. The application searches twelve Atlas candidates, applies the cross-encoder and returns four chunks. The baseline supports cutoffs 1–4. It loads both models once and evaluates page retrieval before the answer guardrail.

## Label format

Use a JSON array. Each record identifies one answerable question and one physical PDF page. A document can be identified by its exact stored filename or its 24-character ID. IDs disambiguate duplicate filenames. The shipped `questions.json` contains five fictional examples to replace with your own labels.

```json
[
  {
    "question": "[A question someone would actually ask about this PDF]",
    "expected_doc": "your-document.pdf",
    "expected_page": 1,
    "expected_keywords": ["[Essential fact with units]", "[A condition or exception]"]
  }
]
```

## Build a 40-question test set

1. Freeze a copy of the original PDFs. Upload them to one evaluation account and wait for every document to become ready and for Atlas indexing to catch up. Record the file hashes, document IDs, app revision, model revisions and index definition. The baked model cache records its revisions in each model directory’s `refs/main` file. Include plausible distractor documents in the search scope for every question.
2. Aim for 12 direct facts, 10 paraphrases, 10 numerical or table-reading questions and 8 questions about exceptions or easily confused cases. Spread questions across files, short and long pages, and sections with similar wording. Use tables whose text survives extraction.
3. Write each question in the reader’s words. Independently locate the answer on the PDF, counting the cover as physical page 1. Record the decisive facts, units, qualifiers and acceptable synonyms. Ask another reader to answer from the labeled page. Revise ambiguous questions and pages that depend on an illustration or a second page.
4. Keep a small development set for choosing settings. Freeze the 40 held-out questions before running the final comparison. With only 40 total, disclose any split and use the actual held-out count in the results. Keep unanswerable questions in a separate abstention study because page rank assumes a gold page exists.
5. Review misses by opening the expected page and checking its extracted text. Record extraction errors, wrong-document matches and ranking errors separately. Preserve the original test run when correcting a label and version the corrected set.

## Run the baseline

Work from `ai-service` with its Python 3.11 environment active and dependencies installed. Set `MONGODB_URI`, `MONGODB_DB` and `VECTOR_INDEX` in `.env` or the shell. Use the evaluation account’s ID from `GET /api/auth/me` and ready document IDs from `GET /api/documents`. Keep private PDFs and labels outside the repository.

```powershell
$userId = Read-Host 'Evaluation user ID'
$docIds = ((Read-Host 'All document IDs separated by spaces').Trim() -split '\s+')
$labels = Read-Host 'Path to the labeled JSON file'
python -m eval.eval --questions $labels --user-id $userId --doc-ids $docIds --k 4
```

Add `--details` to print the first correct rank per question. A hit requires both the expected document and page. Repeated chunks from that page count once. Hit-rate@k divides hits by all questions. MRR@k averages the reciprocal of the first correct rank within k, assigning zero to misses. MRR@4 uses the full production result list. Chunk ranks are measured before deduplicating pages.

## Optional answer judge

Add `--judge` to the baseline command. Configure the AI service’s normal provider settings and internal key. Generation uses the top k contexts, the application prompt and its threshold. Below threshold it abstains. A separate call to the same provider grades the answer against extracted gold-page text and the key facts. This option sends that evidence to the provider.

Scores are 1 for correct, 0.5 for partially correct and 0 for wrong or abstained. The output gives the provider, model, mean and grading coverage. A provider error or invalid grade produces an incomplete run and a nonzero exit status. Report the judge model, threshold, cutoff, coverage and a human spot-check alongside the mean. Self-grading can favor the generating model.

## Run the ablation

The runner reads the same owned, ready corpus. Supply the original PDFs in one folder using their stored filenames. Use unique filenames for this experiment. Sizes and physical page counts are checked. The scratch database must be distinct from the application database and allow collection writes and vector index creation. Allow space for six chunkings of the corpus and one additional Atlas search index.

```powershell
$pdfs = Read-Host 'Directory containing original PDFs'
python -m eval.ablate --questions $labels --user-id $userId --doc-ids $docIds --pdf-dir $pdfs --scratch-db docchat_eval --sizes 200 400 800 --overlaps 0 60 --ks 1 4 8
```

Each size/overlap pair gets fresh page-local chunks and embeddings. The runner builds one index after all inserts, waits for `READY` and `queryable`, and searches with user, document and variant prefilters. Each question uses the same twelve ANN candidates for both rankings and every cutoff within a chunking. The table has 36 rows with the default grid. MRR@12 uses the candidate list, so compare MRR@k at matching cutoffs across the two tools.

Copy stdout into the README. The scratch collection name goes to stderr. Normal exit and handled errors drop that run’s collection. If the machine loses power, use the printed name to identify and remove the leftover collection in the scratch database. Each concurrent run consumes a separate index slot. `--index-timeout` sets the build wait in seconds.

The production encoder’s sequence limit is 512 positions including special tokens. The 800-token variant stores the whole chunk and embeds its visible prefix. The cross-encoder also has a finite question-plus-passage window. Keep those limits and the 12-candidate budget fixed when interpreting comparisons.

## Use the built AI image

From `ai-service` in PowerShell, reuse the Compose image and its model cache. Put the original PDFs and your `questions.json` in the directory selected by `$pdfs`. The bind mounts make the evaluation code and dataset available for this invocation.

```powershell
$mounts = @(
    '--volume', "$(Join-Path $PWD 'eval'):/srv/docchat/eval:ro",
    '--volume', "$(Join-Path $PWD 'atlas-vector-index.json'):/srv/docchat/atlas-vector-index.json:ro",
    '--volume', "$(Resolve-Path $pdfs):/bench:ro"
)
docker compose run --rm --no-deps @mounts ai-service python -m eval.eval --questions /bench/questions.json --user-id $userId --doc-ids $docIds --k 4
docker compose run --rm --no-deps @mounts ai-service python -m eval.ablate --questions /bench/questions.json --user-id $userId --doc-ids $docIds --pdf-dir /bench --scratch-db docchat_eval
```
