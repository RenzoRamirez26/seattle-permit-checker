# Common questions

- **Who is liable if it misses something?** It is a pre-check. The architect who stamps the drawings and the city's
  reviewer decide. The tool says so on every report.
- **Was a model trained for this?** No. A general vision model reads the drawing, and the rules are code. We measured
  the reading instead of training it ([reports/extraction_eval.md](../reports/extraction_eval.md)).
- **Why Seattle?** It publishes each permit's review rounds, review times and the reviewers' comments. Most cities do
  not.
- **What about other cities?** A new city is a new rulebook file and, if it publishes review data, a new data module.
  That work has not been done.
