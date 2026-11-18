{
  "version": 1,
  "name": "Field Notes",
  "settings": {
    "font": "IBM Plex Mono",
    "headingFont": "DM Sans",
    "accent": "#283dae",
    "background": "#e4e9fc",
    "textColor": "#1e2c74",
    "customCss": "",
    "customJs": ""
  },
  "pages": [
    {
      "id": "field-notes-portfolio-page-index",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "field-notes-portfolio-nav",
          "type": "nav",
          "props": {
            "brand": "Field Notes",
            "links": "Projects | #projects\nProfile | #profile",
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
          "id": "field-notes-portfolio-index",
          "type": "section",
          "props": {
            "label": "Portfolio",
            "anchor": "index"
          },
          "style": {
            "paddingBlock": "clamp(35px, 6vw, 88px)",
            "borderBottom": "1px solid #9aa5d8"
          },
          "styles": {
            "tablet": {},
            "mobile": {
              "paddingBlock": 38
            }
          },
          "children": [
            {
              "id": "field-notes-portfolio-discipline",
              "type": "text",
              "props": {
                "text": "MARA LIN / GRAPHIC DESIGNER"
              },
              "style": {
                "fontSize": 13,
                "fontWeight": 600,
                "letterSpacing": ".06em"
              },
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "field-notes-portfolio-index-title",
              "type": "heading",
              "props": {
                "text": "Field Notes",
                "tag": "h1",
                "anchor": ""
              },
              "style": {
                "fontSize": "clamp(65px, 14.3vw, 200px)",
                "lineHeight": ".82",
                "letterSpacing": "-.09em"
              },
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "field-notes-portfolio-intro",
              "type": "text",
              "props": {
                "text": "Editorial design, printed matter and visual identities for people who work with words."
              },
              "style": {
                "maxWidth": "46ch"
              },
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            }
          ]
        },
        {
          "id": "field-notes-portfolio-projects",
          "type": "section",
          "props": {
            "label": "Selected projects",
            "anchor": "projects"
          },
          "style": {},
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "field-notes-portfolio-projects-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, 1.15fr) minmax(0, 1fr)",
                "gap": "clamp(25px, 5vw, 70px)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "field-notes-portfolio-prints",
                  "type": "image",
                  "props": {
                    "src": "https://cheapwork.stream/stock-of-freedom/photos/education/667-hanging-prints-to-dry.jpg",
                    "alt": "Freshly made prints hanging to dry",
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
                  "id": "field-notes-portfolio-projects-index",
                  "type": "section",
                  "props": {
                    "label": "Project index",
                    "anchor": "projects-index"
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
                      "id": "field-notes-portfolio-projects-title",
                      "type": "heading",
                      "props": {
                        "text": "Selected projects",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": "clamp(28px, 4vw, 55px)",
                        "letterSpacing": "-.06em"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "field-notes-portfolio-project-table",
                      "type": "table",
                      "props": {
                        "caption": "Project index",
                        "headers": "Project | Discipline",
                        "rows": "A Walk in Five Parts | Exhibition print\nReading Room | Publication\nNorthbound Routes | Visual identity"
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
          "id": "field-notes-portfolio-profile",
          "type": "section",
          "props": {
            "label": "Profile and contact",
            "anchor": "profile"
          },
          "style": {
            "backgroundColor": "#293faf",
            "color": "#f3f5ff"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "field-notes-portfolio-profile-grid",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0, .8fr) minmax(0, 1.2fr)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0, 1fr)"
                }
              },
              "children": [
                {
                  "id": "field-notes-portfolio-profile-title",
                  "type": "heading",
                  "props": {
                    "text": "About Mara",
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
                  "id": "field-notes-portfolio-profile-text",
                  "type": "section",
                  "props": {
                    "label": "Contact information",
                    "anchor": "profile-text"
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
                      "id": "field-notes-portfolio-bio",
                      "type": "text",
                      "props": {
                        "text": "Independent designer and printmaker. I work with museums, publishers and small teams."
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "field-notes-portfolio-hello",
                      "type": "button",
                      "props": {
                        "text": "Email Mara",
                        "href": "mailto:mara@example.com",
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
          "id": "field-notes-portfolio-footer",
          "type": "footer",
          "props": {
            "brand": "Field Notes",
            "text": "Field Notes is a portfolio template.",
            "links": "Projects | #projects\nProfile | #profile",
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
