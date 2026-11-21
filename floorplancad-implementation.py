import fiftyone as fo
import fiftyone.zoo as foz

# 1. Load FloorPlanCAD dataset (or your local export)
# Note: Ensure you have loaded or downloaded the dataset in FiftyOne
dataset = fo.load_dataset("floorplancad")

# 2. Define the commercial indicator classes present in FloorPlanCAD's taxonomy
commercial_classes = [
    "elevator",     # Multi-story commercial transport
    "parking",      # Commercial/retail parking zones
    "urinal",       # Multi-stall commercial restrooms
    "toilet",       # Restroom facilities
    "chair",        # Office / workstation seating
    "table"         # Desks / conference tables
]

# 3. Create a view filtering for blocks that contain at least one of these commercial tags
# We check if any detection label in the 'ground_truth' field matches our commercial list
commercial_view = dataset.match_tags(["train", "test"]) # optional split filter
commercial_blocks = dataset.filter_labels(
    "ground_truth", 
    fo.ViewField("label").is_in(commercial_classes)
)

# 4. Refine further: Isolate dense footprints (e.g., blocks with multiple desks/chairs or elevators)
# You can count instances per block to ensure they represent commercial density rather than a stray chair
dense_commercial_blocks = commercial_blocks.filter_labels(
    "ground_truth", 
    fo.ViewField("label") == "chair", 
    on_index=True
)

print(f"Total commercial candidate blocks found: {len(commercial_blocks)}")