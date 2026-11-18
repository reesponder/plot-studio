{
  "version": 1,
  "name": "Afterimage",
  "settings": {
    "font": "Manrope",
    "headingFont": "Baskervville",
    "accent": "#a03c20",
    "background": "#eeeae4",
    "textColor": "#272621",
    "customCss": "",
    "customJs": ""
  },
  "pages": [
    {
      "id": "afterimage-lookbook-page-index",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "afterimage-lookbook-nav",
          "type": "nav",
          "props": {
            "brand": "Afterimage",
            "links": "Objects | #objects\nMaterials | #materials",
            "autoLinks": false,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {},
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "afterimage-lookbook-opening",
          "type": "hero",
          "props": {
            "eyebrow": "THE MORNING COLLECTION",
            "title": "Afterimage",
            "text": "Everyday objects in timber, linen and glazed clay.",
            "buttonText": "Explore the collection",
            "buttonLink": "#objects",
            "image": "https://cheapwork.stream/stock-of-freedom/photos/b-interiors-furniture-kitchen-table-corner.jpg",
            "alt": "Timber kitchen table in a quiet room",
            "caption": "",
            "layout": "center"
          },
          "style": {
            "titleSize": "clamp(70px, 13vw, 174px)",
            "gap": 27,
            "paddingTop": "clamp(28px, 3.5vw, 54px)",
            "paddingBottom": 25,
            "objectPosition": "center 59%"
          },
          "styles": {
            "tablet": {},
            "mobile": {
              "titleSize": "clamp(64px, 18vw, 110px)",
              "paddingTop": 34,
              "gap": 23
            }
          },
          "children": []
        },
        {
          "id": "afterimage-lookbook-objects",
          "type": "section",
          "props": {
            "label": "The collection",
            "anchor": "objects"
          },
          "style": {
            "borderTop": "1px solid #aca094"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "afterimage-lookbook-objects-title",
              "type": "heading",
              "props": {
                "text": "The collection",
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
              "id": "afterimage-lookbook-object-grid",
              "type": "columns",
              "props": {
                "columns": "3"
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "afterimage-lookbook-vessel",
                  "type": "card",
                  "props": {
                    "title": "Glazed cup",
                    "text": "Hand-finished clay / sample price £28",
                    "image": "https://cheapwork.stream/stock-of-freedom/photos/b-products-objects-ceramic-mug-counter.jpg",
                    "alt": "Ceramic mug set on a kitchen counter"
                  },
                  "style": {
                    "border": 0,
                    "padding": 0
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "afterimage-lookbook-chair",
                  "type": "card",
                  "props": {
                    "title": "Dining chair",
                    "text": "Solid timber / sample price £310",
                    "image": "https://cheapwork.stream/stock-of-freedom/photos/b-interiors-furniture-dining-chair-detail.jpg",
                    "alt": "Rounded wood detail on a dining chair"
                  },
                  "style": {
                    "border": 0,
                    "padding": 0
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "afterimage-lookbook-linen",
                  "type": "card",
                  "props": {
                    "title": "Linen stack",
                    "text": "Natural linen / sample price £48",
                    "image": "https://cheapwork.stream/stock-of-freedom/photos/b-products-objects-folded-towels.jpg",
                    "alt": "A stack of folded neutral cloths"
                  },
                  "style": {
                    "border": 0,
                    "padding": 0
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                }
              ]
            }
          ]
        },
        {
          "id": "afterimage-lookbook-materials",
          "type": "section",
          "props": {
            "label": "Materials and care",
            "anchor": "materials"
          },
          "style": {
            "backgroundColor": "#ddd6ca"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "afterimage-lookbook-materials-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, 1fr) minmax(0, .86fr)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "afterimage-lookbook-materials-title",
                  "type": "heading",
                  "props": {
                    "text": "Materials and care",
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
                  "id": "afterimage-lookbook-care",
                  "type": "section",
                  "props": {
                    "label": "Care information",
                    "anchor": "care"
                  },
                  "style": {
                    "padding": 0
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "afterimage-lookbook-care-text",
                      "type": "text",
                      "props": {
                        "text": "Wipe sealed timber with a damp cloth and dry it promptly. Wash linen cool and allow it to air-dry."
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "afterimage-lookbook-contact",
                      "type": "button",
                      "props": {
                        "text": "Ask about an object",
                        "href": "mailto:objects@example.com",
                        "variant": "text",
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
                }
              ]
            }
          ]
        },
        {
          "id": "afterimage-lookbook-footer",
          "type": "footer",
          "props": {
            "brand": "Afterimage",
            "text": "Lookbook and sample product prices.",
            "links": "Objects | #objects\nMaterials | #materials",
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
