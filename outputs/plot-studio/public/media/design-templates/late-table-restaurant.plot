{
  "version": 1,
  "name": "Late Table",
  "settings": {
    "font": "DM Sans",
    "headingFont": "Cormorant Garamond",
    "accent": "#922d36",
    "background": "#f7ebd9",
    "textColor": "#482424",
    "customCss": "",
    "customJs": ""
  },
  "pages": [
    {
      "id": "late-table-restaurant-page-index",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "late-table-restaurant-nav",
          "type": "nav",
          "props": {
            "brand": "Late Table",
            "links": "Dinner menu | #menu\nHours | #visit",
            "autoLinks": false,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#e8c5ae"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "late-table-restaurant-opening",
          "type": "hero",
          "props": {
            "eyebrow": "A NEIGHBOURHOOD DINING ROOM",
            "title": "Late Table",
            "text": "Pasta, market vegetables and a short wine list. Dinner from Thursday to Sunday.",
            "buttonText": "Read the dinner menu",
            "buttonLink": "#menu",
            "image": "",
            "alt": "",
            "caption": "",
            "layout": "center"
          },
          "style": {
            "titleSize": "clamp(108px, 17vw, 245px)",
            "paddingBlock": "clamp(42px, 5vw, 70px)",
            "backgroundColor": "#e8c5ae",
            "color": "#712930"
          },
          "styles": {
            "tablet": {},
            "mobile": {
              "titleSize": "clamp(72px, 21vw, 135px)",
              "paddingBlock": 34
            }
          },
          "children": []
        },
        {
          "id": "late-table-restaurant-menu",
          "type": "section",
          "props": {
            "label": "Dinner menu",
            "anchor": "menu"
          },
          "style": {
            "paddingBlock": "clamp(27px, 4vw, 64px)"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "late-table-restaurant-menu-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, .9fr) minmax(0, 1.1fr)",
                "alignItems": "stretch"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "late-table-restaurant-pasta",
                  "type": "image",
                  "props": {
                    "src": "https://cheapwork.stream/stock-of-freedom/photos/food-07-pasta-dinner.jpg",
                    "alt": "Pasta served at a dinner table",
                    "caption": ""
                  },
                  "style": {
                    "alignSelf": "center"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "late-table-restaurant-menu-panel",
                  "type": "section",
                  "props": {
                    "label": "A sample dinner service",
                    "anchor": "menu-panel"
                  },
                  "style": {
                    "padding": "clamp(18px, 3.6vw, 54px)",
                    "border": "1px solid #b97566",
                    "alignSelf": "stretch"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {
                      "padding": 14
                    }
                  },
                  "children": [
                    {
                      "id": "late-table-restaurant-menu-title",
                      "type": "heading",
                      "props": {
                        "text": "Dinner",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "late-table-restaurant-menu-table",
                      "type": "table",
                      "props": {
                        "caption": "Sample menu",
                        "headers": "Dish | Price",
                        "rows": "Market vegetables, lemon and herbs | £9\nTagliatelle with slow-cooked tomatoes | £17\nRoasted greens, toasted breadcrumbs | £8\nOlive oil cake and cream | £7"
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "id": "late-table-restaurant-visit",
          "type": "section",
          "props": {
            "label": "Opening hours and reservations",
            "anchor": "visit"
          },
          "style": {
            "backgroundColor": "#942f39",
            "color": "#fff2e8"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "late-table-restaurant-visit-title",
              "type": "heading",
              "props": {
                "text": "At the table",
                "tag": "h2",
                "anchor": ""
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "late-table-restaurant-visit-copy",
              "type": "text",
              "props": {
                "text": "Thursday to Saturday, 6–10 pm\nSunday, 5–9 pm\nTables of up to six"
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "late-table-restaurant-visit-action",
              "type": "button",
              "props": {
                "text": "Ask for a table",
                "href": "mailto:tables@example.com",
                "variant": "outline",
                "newTab": false
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            }
          ]
        },
        {
          "id": "late-table-restaurant-footer",
          "type": "footer",
          "props": {
            "brand": "Late Table",
            "text": "A sample restaurant website.",
            "links": "Dinner | #menu\nHours | #visit",
            "autoLinks": false
          },
          "style": {},
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        }
      ]
    }
  ],
  "graph": {
    "nodes": [],
    "edges": []
  },
  "data": {
    "tables": []
  },
  "backend": {
    "version": 1,
    "routes": []
  }
}
