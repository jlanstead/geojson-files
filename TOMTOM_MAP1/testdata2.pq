let
  Poly1 =
"{
  ""type"": ""Topology"",
  ""objects"": {
    ""regions"": {
      ""type"": ""GeometryCollection"",
      ""geometries"": [
        {
          ""type"": ""Polygon"",
          ""arcs"": [[0]],
          ""properties"": { ""id"": ""poly1"", ""name"": ""South Charlotte"", ""legend"": ""Zone A"" }
        }
      ]
    }
  },
  ""arcs"": [
    [
      [-80.92, 35.14],
      [-80.78, 35.14],
      [-80.78, 35.23],
      [-80.92, 35.23],
      [-80.92, 35.14]
    ]
  ]
}",

  Poly2 =
"{
  ""type"": ""Topology"",
  ""objects"": {
    ""regions"": {
      ""type"": ""GeometryCollection"",
      ""geometries"": [
        {
          ""type"": ""Polygon"",
          ""arcs"": [[0]],
          ""properties"": { ""id"": ""poly2"", ""name"": ""North Charlotte"", ""legend"": ""Zone B"" }
        }
      ]
    }
  },
  ""arcs"": [
    [
      [-80.95, 35.30],
      [-80.78, 35.30],
      [-80.78, 35.43],
      [-80.95, 35.43],
      [-80.95, 35.30]
    ]
  ]
}",

  TableOut =
    #table(
      type table [
        PolygonID = text,
        Name = text,
        Legend = text,
        TopoJSON = text
      ],
      {
        {"poly1", "South Charlotte", "Zone A", Poly1},
        {"poly2", "North Charlotte", "Zone B", Poly2}
      }
    )
in
  TableOut
