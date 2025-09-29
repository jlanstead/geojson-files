let
  Source = #table(
    type table [
      LocationID = text,
      Name = text,
      Latitude = number,
      Longitude = number,
      Legend = text
    ],
    {
      {"CLT",        "Uptown Charlotte", 35.2271, -80.8431, "Core"},
      {"MATTHEWS",   "Matthews",         35.1168, -80.7237, "South/East"},
      {"GASTONIA",   "Gastonia",         35.2621, -81.1873, "West"},
      {"HUNTERSVILLE","Huntersville",    35.4107, -80.8423, "North"},
      {"CONCORD",    "Concord",          35.4088, -80.5795, "North/East"}
    }
  )
in
  Source
