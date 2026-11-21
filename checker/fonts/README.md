# Fonts used in the PDF downloads

`DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` are DejaVu Sans, version 2.35, from the DejaVu Fonts
project (https://dejavu-fonts.github.io). These copies were taken unchanged from the files that
matplotlib 3.11.2 distributes.

`checker/pdf.py` embeds them in the PDFs so that accented letters, quotation marks and other
marks print correctly; the fonts built into the PDF format cannot do that.

Licence: see `LICENSE_DEJAVU` in this folder (Bitstream Vera Fonts licence; the DejaVu changes
are in the public domain). It allows the fonts to be copied, distributed and embedded, provided
the copyright notice and the licence travel with them, which is why that file is here.
