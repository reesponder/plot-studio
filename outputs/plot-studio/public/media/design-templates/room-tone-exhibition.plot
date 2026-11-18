{
  "version": 1,
  "name": "Room Tone",
  "settings": {
    "font": "Space Mono",
    "headingFont": "Archivo Black",
    "accent": "#f0cc38",
    "background": "#20201c",
    "textColor": "#f1ecd9",
    "customCss": "",
    "customJs": ""
  },
  "pages": [
    {
      "id": "room-tone-exhibition-page-index",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "room-tone-exhibition-nav",
          "type": "nav",
          "props": {
            "brand": "Room Tone",
            "links": "Exhibition | #works\nVisit | #visit",
            "autoLinks": false,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#20201c",
            "borderBottom": "1px solid #575346"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "room-tone-exhibition-poster",
          "type": "section",
          "props": {
            "label": "Exhibition poster",
            "anchor": "poster"
          },
          "style": {
            "paddingBlock": "clamp(18px, 3vw, 48px)"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "room-tone-exhibition-poster-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, 1.03fr) minmax(0, .97fr)",
                "gap": 0,
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
                  "id": "room-tone-exhibition-poster-type",
                  "type": "section",
                  "props": {
                    "label": "Exhibition overview",
                    "anchor": "poster-type"
                  },
                  "style": {
                    "padding": "clamp(22px, 4.25vw, 65px)",
                    "backgroundColor": "#f0cc38",
                    "color": "#242218",
                    "alignSelf": "stretch",
                    "alignContent": "center"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {
                      "padding": 22
                    }
                  },
                  "children": [
                    {
                      "id": "room-tone-exhibition-edition",
                      "type": "text",
                      "props": {
                        "text": "GALLERY 02 / AUTUMN PROGRAMME"
                      },
                      "style": {
                        "fontSize": 12,
                        "fontWeight": 700,
                        "letterSpacing": ".08em"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "room-tone-exhibition-poster-title",
                      "type": "heading",
                      "props": {
                        "text": "ROOM\nTONE",
                        "tag": "h1",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": "clamp(57px, 9.7vw, 145px)",
                        "letterSpacing": "-.095em",
                        "lineHeight": ".83"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "room-tone-exhibition-subtitle",
                      "type": "text",
                      "props": {
                        "text": "Paintings about what stays in a room after everyone has left."
                      },
                      "style": {
                        "maxWidth": "29ch"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "room-tone-exhibition-visit-action",
                      "type": "button",
                      "props": {
                        "text": "Plan your visit",
                        "href": "#visit",
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
                  "id": "room-tone-exhibition-opening-image",
                  "type": "image",
                  "props": {
                    "src": "https://plotstudio.pro/99host-assets/entry-painter.webp",
                    "alt": "A hand-painted canvas of a painter at work on an easel",
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
                }
              ]
            }
          ]
        },
        {
          "id": "room-tone-exhibition-works",
          "type": "section",
          "props": {
            "label": "Exhibition",
            "anchor": "works"
          },
          "style": {
            "borderTop": "1px solid #575346"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "room-tone-exhibition-works-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, 1.2fr) minmax(0, .8fr)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "room-tone-exhibition-painting-detail",
                  "type": "image",
                  "props": {
                    "src": "https://plotstudio.pro/99host-assets/entry-night-palms.webp",
                    "alt": "An oil painting of palm trees in a dark night scene",
                    "caption": ""
                  },
                  "style": {},
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "room-tone-exhibition-statement",
                  "type": "section",
                  "props": {
                    "label": "About the display",
                    "anchor": "statement"
                  },
                  "style": {
                    "padding": 0,
                    "alignSelf": "center"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "room-tone-exhibition-works-title",
                      "type": "heading",
                      "props": {
                        "text": "Paint after dark",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": "clamp(30px, 4vw, 60px)"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "room-tone-exhibition-statement-text",
                      "type": "text",
                      "props": {
                        "text": "The paintings share two things: a scene noticed late, and a surface left a little unfinished. Visit the gallery to see how the work changes from across the room and up close."
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
          "id": "room-tone-exhibition-visit",
          "type": "section",
          "props": {
            "label": "Hours and access",
            "anchor": "visit"
          },
          "style": {
            "backgroundColor": "#f0cc38",
            "color": "#242218"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "room-tone-exhibition-hours-title",
              "type": "heading",
              "props": {
                "text": "Visit",
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
              "id": "room-tone-exhibition-hours",
              "type": "text",
              "props": {
                "text": "Wednesday to Sunday, noon–6 pm\nGallery 02 · Step-free entrance\nFree entry"
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
          "id": "room-tone-exhibition-footer",
          "type": "footer",
          "props": {
            "brand": "Room Tone",
            "text": "Gallery 02 / Autumn programme",
            "links": "Exhibition | #works\nVisit | #visit",
            "autoLinks": false
          },
          "style": {
            "borderColor": "#575346"
          },
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
