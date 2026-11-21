"""Draw the demo floor plans with printed dimensions.

    python demo/make_plans.py            # writes all three PNGs into demo/
    python demo/make_plans.py salon      # only the salon

- compliant_plan.png, flawed_plan.png: the same fictional 40 ft x 60 ft café, drawn twice.
- salon_flawed_plan.png: a fictional 20 ft x 40 ft hair salon with three planted problems.

Dimensions are printed on the drawings so the vision model reads numbers instead of
guessing scale. The matching *_extraction.json files are the ground truth, written by hand.
"""
from __future__ import annotations

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Arc, Circle, Rectangle

HERE = Path(__file__).parent
W, L = 40, 60  # feet


def room(ax, x, y, w, h, name, sub="", fc="white", fs=9):
    ax.add_patch(Rectangle((x, y), w, h, fill=True, fc=fc, ec="black", lw=2))
    ax.text(x + w / 2, y + h / 2 + (0.9 if sub else 0), name, ha="center", va="center", fontsize=fs, weight="bold")
    if sub:
        ax.text(x + w / 2, y + h / 2 - 0.9, sub, ha="center", va="center", fontsize=fs - 2)


def door(ax, x, y, width_ft, wall, swing_out, label, label_dx=0, label_dy=0):
    """Door in a wall. wall: 'S','N','E','W' or 'H'/'V' (interior horizontal/vertical wall)."""
    horiz = wall in ("S", "N", "H")
    if horiz:
        ax.plot([x, x + width_ft], [y, y], color="white", lw=4, zorder=3)
        sign = {"S": -1, "N": 1, "H": 1}[wall] * (1 if swing_out else -1)
        ax.plot([x, x], [y, y + sign * width_ft], color="black", lw=1.5, zorder=4)
        t1, t2 = (0, 90) if sign > 0 else (270, 360)
        ax.add_patch(Arc((x, y), 2 * width_ft, 2 * width_ft, theta1=t1, theta2=t2, lw=1, zorder=4))
        ax.text(x + width_ft / 2 + label_dx, y + label_dy, label, ha="center", va="center", fontsize=7,
                bbox=dict(fc="white", ec="none", pad=0.6), zorder=5)
    else:
        ax.plot([x, x], [y, y + width_ft], color="white", lw=4, zorder=3)
        sign = {"E": 1, "W": -1, "V": 1}[wall] * (1 if swing_out else -1)
        ax.plot([x, x + sign * width_ft], [y, y], color="black", lw=1.5, zorder=4)
        t1, t2 = (0, 90) if sign > 0 else (90, 180)
        ax.add_patch(Arc((x, y), 2 * width_ft, 2 * width_ft, theta1=t1, theta2=t2, lw=1, zorder=4))
        ax.text(x + label_dx, y + width_ft / 2 + label_dy, label, ha="center", va="center", fontsize=7,
                bbox=dict(fc="white", ec="none", pad=0.6), zorder=5)


def table(ax, x, y, accessible=False):
    ax.add_patch(Rectangle((x, y), 3, 3, fc="#e8e8e8", ec="black", lw=1))
    for dx, dy in ((1.5, -0.6), (1.5, 3.6), (-0.6, 1.5), (3.6, 1.5)):
        ax.add_patch(Circle((x + dx, y + dy), 0.45, fc="white", ec="black", lw=0.8))
    if accessible:
        ax.text(x + 1.5, y + 1.5, "ADA", ha="center", va="center", fontsize=6, weight="bold")


def dim(ax, x1, y1, x2, y2, text, off=0.0):
    ax.annotate("", xy=(x1, y1), xytext=(x2, y2), arrowprops=dict(arrowstyle="<->", lw=0.8, color="#333"))
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    ax.text(mx + (off if x1 == x2 else 0), my + (off if y1 == y2 else 0), text, ha="center", va="center",
            fontsize=7, color="#111", bbox=dict(fc="white", ec="none", pad=0.4), zorder=6)


def exit_sign(ax, x, y):
    ax.text(x, y, "EXIT SIGN", ha="center", va="center", fontsize=6, color="white", weight="bold",
            bbox=dict(fc="#c00000", ec="#c00000", pad=1.5), zorder=7)


def extinguisher(ax, x, y, k=False):
    ax.text(x, y, "FE-K" if k else "FE", ha="center", va="center", fontsize=6, weight="bold",
            bbox=dict(boxstyle="circle", fc="white", ec="#c00000", lw=1.2), zorder=7)


def draw(flawed: bool) -> Path:
    fig, ax = plt.subplots(figsize=(11, 13), dpi=150)
    ax.set_xlim(-7, W + 22); ax.set_ylim(-9, L + 10); ax.set_aspect("equal"); ax.axis("off")
    title = "CAFÉ TENANT IMPROVEMENT - FLOOR PLAN " + ("B" if flawed else "A")
    ax.text(-6, L + 8, title, fontsize=14, weight="bold")
    ax.text(-6, L + 6.3, "Fictional demo drawing. Not for construction. All dimensions printed; do not scale.", fontsize=8)

    # rooms
    room(ax, 0, 0, W, 32, "", "")
    ax.text(17, 30.2, "DINING ROOM   1,280 SF   (40'-0\" x 32'-0\")", ha="center", va="center", fontsize=10, weight="bold")
    room(ax, 0, 32, W, 6, "SERVICE COUNTER", "240 SF  (40'-0\" x 6'-0\")", fc="#f6f6f6")
    room(ax, 0, 38, 24, 22, "", "")
    ax.text(12, 48.6, "KITCHEN   528 SF   (24'-0\" x 22'-0\")", ha="center", va="center", fontsize=10, weight="bold")
    room(ax, 24, 52, 16, 8, "STORAGE", "128 SF  (16'-0\" x 8'-0\")")
    cor = 3.0 if flawed else 4.0
    room(ax, 24, 38, 16, cor, "", "")
    ax.text(32, 38 + cor / 2, f"CORRIDOR  {int(cor * 12)}\" CLEAR WIDTH", ha="center", va="center", fontsize=7)
    ry, rh = 38 + cor, 52 - 38 - cor
    for num, (who, x) in enumerate((("WOMEN", 24), ("MEN", 32)), start=1):
        room(ax, x, ry, 8, rh, "", "")
        ax.text(x + 4, ry + rh - 0.8, f"RESTROOM {num}", ha="center", va="center", fontsize=7, weight="bold")
        ax.text(x + 4, ry + rh - 1.8, who, ha="center", va="center", fontsize=6.5)
        ax.text(x + 4, ry + rh - 2.8, "1 WC, 1 LAV", ha="center", va="center", fontsize=6.5)
        d = 54 if flawed else 60
        r = d / 24
        ax.add_patch(Circle((x + 4, ry + 1.7 + r), r, fill=False, ls="--", ec="#444", lw=1))
        ax.text(x + 4, ry + 1.7 + r, f"{d}\" DIA\nTURNING\nCIRCLE", ha="center", va="center", fontsize=6)
        dw = 30 if flawed else 34
        ax.plot([x + 2.5, x + 5.5], [ry, ry], color="white", lw=4, zorder=3)   # door opening
        ax.text(x + 4, ry + 0.75, f"DOOR {dw}\" CLR", ha="center", va="center", fontsize=6.5, zorder=5)

    # exits
    door(ax, 18, 0, 3, "S", not flawed, "DOOR 1 - MAIN ENTRY / EXIT  36\" CLR", label_dx=11.5, label_dy=-1.6)
    ax.text(19.5, -7.2, "SIDEWALK / STREET (SOUTH)", ha="center", fontsize=8, style="italic")
    if flawed:
        ax.text(9.5, 1.4, "DOOR 1 SWINGS IN (INTO DINING ROOM)", ha="center", fontsize=6.5)
    else:
        door(ax, W, 24.8, 3, "E", True, "DOOR 2 - EXIT  36\" CLR", label_dx=7.2)
        door(ax, 15, L, 3, "N", True, "DOOR 3 - KITCHEN SERVICE EXIT  36\" CLR", label_dx=0, label_dy=4.0)
        exit_sign(ax, 19.5, 1.6); exit_sign(ax, W - 3.4, 29.0); exit_sign(ax, 16.5, L - 1.4)

    # tables: 14 four-tops = 56 seats. Chairs project 1.05 ft past each table edge.
    pitch = 7.6 if flawed else 8.5          # centre-to-centre; chair-to-chair gap = pitch - 5.1 ft
    cols = [3 + i * pitch for i in range(5)]
    gap_in = round((pitch - 5.1) * 12)      # 30 in. flawed, 41 in. compliant
    n = 0
    for row_y in (5, 12.5, 20):
        for i, cx in enumerate(cols):
            if row_y == 5 and i == 2:
                continue                     # keep the entry clear
            table(ax, cx - 1.5, row_y, accessible=(not flawed and n in (0, 4, 9)))
            n += 1
    x1, x2 = cols[0] + 2.55, cols[1] - 2.55
    dim(ax, x1, 14.0, x2, 14.0, f"{gap_in}\"", off=2.6)
    ax.text((x1 + x2) / 2, 10.9, "AISLE A", ha="center", fontsize=6)
    seats = "56 SEATS (14 TABLES OF 4)" + ("" if flawed else ",  3 ACCESSIBLE TABLES MARKED \"ADA\" (12 SEATS)")
    ax.text(17, 28.2, seats, ha="center", va="center", fontsize=7.5)

    # kitchen equipment
    eq = [(1, 40, 5, 3, "RANGE"), (6.5, 40, 3, 3, "FRYER"), (10.5, 40, 4, 3, "ESPRESSO\nPREP"),
          (1, 53, 7, 2.5, "3-COMP SINK"), (18, 40, 4.5, 3, "WALK-IN\nCOOLER"), (19.5, 53, 3.5, 2.5, "MOP\nSINK")]
    for x, y, w, h, name in eq:
        ax.add_patch(Rectangle((x, y), w, h, fc="#dddddd", ec="black", lw=1))
        ax.text(x + w / 2, y + h / 2, name, ha="center", va="center", fontsize=6)
    if not flawed:
        ax.add_patch(Rectangle((0.6, 39.6), 9.3, 3.8, fill=False, ec="#0050b0", ls="--", lw=1.5))
        ax.text(0.7, 44.3, "TYPE I HOOD + FIRE SUPPRESSION OVER RANGE AND FRYER", ha="left", fontsize=6, color="#0050b0")
        ax.add_patch(Rectangle((9.5, 53), 2.5, 2.5, fc="#dddddd", ec="black", lw=1))
        ax.text(10.75, 54.25, "HAND\nSINK", ha="center", va="center", fontsize=6)
        extinguisher(ax, 16.2, 41.5, k=True); extinguisher(ax, 1.4, 30.2); extinguisher(ax, 38, 33.5)
    else:
        ax.text(0.9, 44.3, "NO HOOD OVER RANGE / FRYER", ha="left", fontsize=6)

    # overall dimensions
    dim(ax, 0, -4.6, W, -4.6, "40'-0\"", off=-1.0)
    dim(ax, -3.5, 0, -3.5, L, "60'-0\"", off=-2.2)

    # notes
    nx = W + 3
    notes = ["GENERAL NOTES", "", "Gross tenant area: 2,400 SF", "Use: café with indoor seating", "Seats: 56"]
    if not flawed:
        notes += ["Accessible seats: 12 (3 tables)", "Building is fully sprinklered", "(NFPA 13).",
                  "Emergency lighting at all exits.", "Exit signs: 3 (illuminated)",
                  "Fire extinguishers: 2 ABC,", "1 Class K at cook line.", "Grease interceptor below",
                  "3-comp sink."]
    else:
        notes += ["Existing shell, no sprinklers."]
    for i, t in enumerate(notes):
        ax.text(nx, 20 - i * 1.5, t, fontsize=8, weight="bold" if i == 0 else "normal")
    ax.text(nx + 2, 44, "N", fontsize=12, weight="bold", ha="center")
    ax.annotate("", xy=(nx + 2, 49), xytext=(nx + 2, 45), arrowprops=dict(arrowstyle="->", lw=1.5))

    out = HERE / ("flawed_plan.png" if flawed else "compliant_plan.png")
    fig.savefig(out, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return out


def draw_salon() -> Path:
    """A 20 ft x 40 ft salon. Planted problems: 32 in. aisle, 30 in. restroom door, 54 in. turning circle."""
    w, l = 20, 40
    fig, ax = plt.subplots(figsize=(9, 12), dpi=150)
    ax.set_xlim(-7, w + 20); ax.set_ylim(-9, l + 9); ax.set_aspect("equal"); ax.axis("off")
    ax.text(-6, l + 7, "HAIR SALON TENANT IMPROVEMENT - FLOOR PLAN", fontsize=14, weight="bold")
    ax.text(-6, l + 5.5, "Fictional demo drawing. Not for construction. All dimensions printed; do not scale.", fontsize=8)

    room(ax, 0, 0, w, 8, "", "", fc="#f6f6f6")
    ax.text(10, 7.1, "WAITING / RECEPTION   160 SF  (20'-0\" x 8'-0\")", ha="center", va="center", fontsize=7.5, weight="bold")
    room(ax, 0, 8, w, 20, "", "")
    ax.text(10, 26.6, "STYLING FLOOR   400 SF   (20'-0\" x 20'-0\")", ha="center", va="center", fontsize=8, weight="bold")
    ax.text(10, 25.4, "6 STYLING STATIONS, 2 SHAMPOO BOWLS", ha="center", va="center", fontsize=7)
    room(ax, 0, 28, 10, 12, "STORAGE /\nCOLOR BAR", "", fs=8)
    ax.text(5, 30.2, "120 SF  (10'-0\" x 12'-0\")", ha="center", va="center", fontsize=6.5)
    room(ax, 10, 28, 10, 4, "", "")
    ax.text(15, 30, "CORRIDOR  44\" CLEAR WIDTH", ha="center", va="center", fontsize=6.5)
    room(ax, 10, 32, 10, 8, "", "")
    ax.text(15, 39.2, "ALL-GENDER RESTROOM", ha="center", va="center", fontsize=6.5, weight="bold")
    ax.text(15, 38.3, "1 WC, 1 LAV", ha="center", va="center", fontsize=6.5)
    r = 54 / 24
    ax.add_patch(Circle((15, 35.4), r, fill=False, ls="--", ec="#444", lw=1))
    ax.text(15, 35.4, "54\" DIA\nTURNING\nCIRCLE", ha="center", va="center", fontsize=6)
    ax.plot([13.5, 16.5], [32, 32], color="white", lw=4, zorder=3)
    ax.text(15, 32.7, "DOOR 30\" CLR", ha="center", va="center", fontsize=6.5, zorder=5)

    door(ax, 8.5, 0, 3, "S", False, "DOOR 1 - MAIN ENTRY / EXIT  34\" CLR", label_dx=1.5, label_dy=-1.6)
    ax.text(10, -7.2, "SIDEWALK / STREET (SOUTH)", ha="center", fontsize=8, style="italic")
    ax.add_patch(Rectangle((13.5, 2.6), 5.5, 2.2, fc="#dddddd", ec="black", lw=1))
    ax.text(16.25, 3.7, "RECEPTION DESK", ha="center", va="center", fontsize=6)
    for i in range(3):
        ax.add_patch(Rectangle((1 + i * 1.7, 3.6), 1.3, 1.3, fc="white", ec="black", lw=0.8))
    ax.text(3.3, 2.7, "WAITING CHAIRS", ha="center", fontsize=6)

    # two rows of three stations facing the side walls; the centre aisle is the planted problem
    for row_x, mirror_x in ((0.4, 0.0), (w - 3.9, w - 0.5)):
        for j in range(3):
            y = 10 + j * 4.6
            ax.add_patch(Rectangle((row_x, y), 3.5, 2.6, fc="#e8e8e8", ec="black", lw=1))
            ax.text(row_x + 1.75, y + 1.3, f"STATION", ha="center", va="center", fontsize=5.5)
    x1, x2 = 8.67, 11.33     # 32 in. = 2.67 ft
    for x in (x1, x2):
        ax.plot([x, x], [9.5, 22.5], color="#888", lw=0.8, ls=":")
    dim(ax, x1, 16.3, x2, 16.3, "32\"", off=1.1)
    ax.text(10, 14.6, "AISLE A", ha="center", fontsize=6)
    ax.text(10, 13.6, "(between chairs)", ha="center", fontsize=5.5)
    for x in (6.2, 12.2):
        ax.add_patch(Rectangle((x, 23.2), 1.6, 1.4, fc="#dddddd", ec="black", lw=1))
    ax.text(10, 22.6, "SHAMPOO BOWLS", ha="center", fontsize=6)

    dim(ax, 0, -4.6, w, -4.6, "20'-0\"", off=-1.0)
    dim(ax, -3.5, 0, -3.5, l, "40'-0\"", off=-2.2)
    notes = ["GENERAL NOTES", "", "Gross tenant area: 800 SF", "Use: hair salon, 6 stations",
             "Ground floor, existing shell.", "No sprinklers."]
    for i, t in enumerate(notes):
        ax.text(w + 3, 20 - i * 1.5, t, fontsize=8, weight="bold" if i == 0 else "normal")
    ax.text(w + 5, 34, "N", fontsize=12, weight="bold", ha="center")
    ax.annotate("", xy=(w + 5, 39), xytext=(w + 5, 35), arrowprops=dict(arrowstyle="->", lw=1.5))

    out = HERE / "salon_flawed_plan.png"
    fig.savefig(out, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return out


if __name__ == "__main__":
    import sys

    which = set(sys.argv[1:]) or {"cafe", "salon"}
    if "cafe" in which:
        for f in (False, True):
            print(draw(f))
    if "salon" in which:
        print(draw_salon())
