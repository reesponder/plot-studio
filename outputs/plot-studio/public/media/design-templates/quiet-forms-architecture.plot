{
  "version": 1,
  "name": "Quiet Forms",
  "settings": {
    "font": "Inter",
    "headingFont": "Instrument Serif",
    "accent": "#3d4d42",
    "background": "#f2efe7",
    "textColor": "#222b23",
    "customCss": "",
    "customJs": ""
  },
  "pages": [
    {
      "id": "quiet-forms-architecture-page-index",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "quiet-forms-architecture-nav",
          "type": "nav",
          "props": {
            "brand": "Quiet Forms",
            "links": "Selected work | #work\nThe practice | #practice\nContact | #contact",
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
          "id": "quiet-forms-architecture-opening",
          "type": "hero",
          "props": {
            "eyebrow": "ARCHITECTURE & INTERIORS",
            "title": "Room for\nthe landscape.",
            "text": "An architecture practice working with rural buildings, existing fabric, and the light already on site.",
            "buttonText": "Selected work",
            "buttonLink": "#work",
            "image": "https://cheapwork.stream/stock-of-freedom/photos/architecture-12-lakeside-cabin.jpg",
            "alt": "Timber cabin beside a quiet lake",
            "caption": "",
            "layout": "split"
          },
          "style": {
            "titleSize": "clamp(66px, 8.4vw, 145px)",
            "gap": "clamp(24px, 5vw, 90px)",
            "paddingBlock": "clamp(32px, 5vw, 76px)",
            "objectPosition": "58% center"
          },
          "styles": {
            "tablet": {},
            "mobile": {
              "titleSize": "clamp(53px, 15vw, 86px)",
              "paddingBlock": 30,
              "gap": 25
            }
          },
          "children": []
        },
        {
          "id": "quiet-forms-architecture-work",
          "type": "section",
          "props": {
            "label": "Selected work",
            "anchor": "work"
          },
          "style": {
            "borderTop": "1px solid #a6a598"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "quiet-forms-architecture-work-title",
              "type": "heading",
              "props": {
                "text": "Selected work",
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
              "id": "quiet-forms-architecture-work-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, 1.18fr) minmax(0, .82fr)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "quiet-forms-architecture-stair",
                  "type": "image",
                  "props": {
                    "src": "https://cheapwork.stream/stock-of-freedom/photos/architecture-03-concrete-stairwell.jpg",
                    "alt": "Concrete stairwell with light on its landing",
                    "caption": "Stair House / adaptive reuse"
                  },
                  "style": {},
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "quiet-forms-architecture-chapel",
                  "type": "image",
                  "props": {
                    "src": "https://cheapwork.stream/stock-of-freedom/photos/architecture-15-small-chapel.jpg",
                    "alt": "A small chapel in the countryside",
                    "caption": "Hill Chapel / conservation study"
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
        },
        {
          "id": "quiet-forms-architecture-practice",
          "type": "section",
          "props": {
            "label": "The practice",
            "anchor": "practice"
          },
          "style": {
            "backgroundColor": "#dfe2d2"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "quiet-forms-architecture-practice-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, 1fr) minmax(0, .85fr)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "quiet-forms-architecture-practice-title",
                  "type": "heading",
                  "props": {
                    "text": "Keep what the site gives you.",
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
                  "id": "quiet-forms-architecture-practice-text",
                  "type": "text",
                  "props": {
                    "text": "We start with a walk through the building. Retaining the useful parts makes room in the budget for details that change how a place feels."
                  },
                  "style": {
                    "maxWidth": "45ch",
                    "alignSelf": "center"
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
          "id": "quiet-forms-architecture-contact",
          "type": "section",
          "props": {
            "label": "Contact",
            "anchor": "contact"
          },
          "style": {},
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "quiet-forms-architecture-contact-title",
              "type": "heading",
              "props": {
                "text": "Working with an existing building?",
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
              "id": "quiet-forms-architecture-contact-action",
              "type": "button",
              "props": {
                "text": "Introduce your project",
                "href": "mailto:studio@example.com",
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
          "id": "quiet-forms-architecture-footer",
          "type": "footer",
          "props": {
            "brand": "Quiet Forms",
            "text": "Architecture and interiors",
            "links": "Selected work | #work\nContact | #contact",
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
