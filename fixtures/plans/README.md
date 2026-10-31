# Drawing fixtures

`residential-dimensioned.png` is the original image supplied by the user in the conversation, saved without redrawing or changing its pixels. It is 1280×1112 and includes furniture, thick walls, door swings, numbered rooms, rotated dimensions, opening marks and stacked opening sizes. Its provenance, hash and current recognition assessment are recorded in `residential-dimensioned.reference.json`. No measurements in this image have been human-confirmed in the application.

`office-a.*`, `office-b.*` and `offices.pdf` are deliberately simple synthetic fixtures for normalization, coordinate transforms, provenance and deterministic engine tests. They do not demonstrate recognition accuracy on architectural working drawings. The office JSON files can be loaded only through the explicit disclosed confirmed-fixture path. They never replace a user upload.

Run the actual private HTTP/upload/rendering/Mozaik/Vision path on the supplied image with:

```sh
npm run smoke:geometry -- --plan fixtures/plans/residential-dimensioned.png
```

The command uses isolated temporary storage, the configured model and a maximum USD 1 runtime budget. It runs an empty rule registry, so it tests extraction wiring rather than office-rule applicability to an apparently residential drawing. `--plan` accepts PNG/JPG/PDF; `--page 2` selects a PDF page. To inspect full observations, add `--report /tmp/unique-private-report.json`; the file is created with owner-only permissions and cannot overwrite an existing report. Reports must stay outside version control. Images and raw prompts are not printed.

The first live run with `geometry-v2-technical-plan` completed and returned 11 suggested elements, zero physical measurements and an estimated cost of USD 0.038217. Manual comparison rejected recognition accuracy: several bounds are displaced and the window opening beside room 3 appears as a door. A COMPLETE session only means the extraction pipeline finished. Recognition acceptance remains **NOT_PASSED**. Further extraction work must be checked against this image, including the unlabelled bathroom door and window/door distinctions; do not accept element counts alone.

Current changes preserve raw annotations as located evidence independently of supported measurements. Room numbers and marks are not counts; nominal door width/height pairs are not clear widths; bare numbers do not establish centimetres. The actual image normalization is tested. Mock-response tests cover annotation mapping and uncertainty handling and do not prove visual recognition accuracy.
