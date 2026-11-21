-- A Seattle database as pipeline/db.py created it before the columns were renamed (November 2026).
-- Used by tests/test_pipeline.py to check that opening such a file gives a clear "rebuild it" error.
-- The names here are the old ones on purpose; they appear nowhere else in the repository.
CREATE TABLE permits ("Permit_id" TEXT, "County" TEXT, "Address" TEXT, "Comm_Res" INTEGER, "Description" TEXT,
  "Estimated_Cost" REAL, "Issue_Date" TEXT, "New_Alter_Demo" INTEGER, "Permit_Type" TEXT, "Status" TEXT,
  "Category" TEXT, "Applied_Date" TEXT, "Review_Cycles" INTEGER, "Days_Plan_Review" REAL,
  "Days_Out_Corrections" REAL, "Source_URL" TEXT, "Raw" TEXT, PRIMARY KEY ("County", "Permit_id"));
INSERT INTO permits ("Permit_id", "County") VALUES ('OLD-1', 'King');
