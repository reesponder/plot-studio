{
  "version": 1,
  "name": "Relayboard",
  "settings": {
    "font": "DM Sans",
    "headingFont": "Geist",
    "accent": "#c5f4a1",
    "background": "#12211e",
    "textColor": "#e7f2ee",
    "customCss": "",
    "customJs": "",
    "h1Size": "clamp(46px,6.5vw,96px)",
    "h2Size": "clamp(36px,4.7vw,66px)",
    "h3Size": "clamp(24px,2.4vw,36px)"
  },
  "pages": [
    {
      "id": "page-bb94b457-394c-4596-9f2f-d679d7c676e6-1",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "block-4f714206-5a57-44db-92d8-8fb052a509d1-l",
          "type": "nav",
          "props": {
            "brand": "relayboard.",
            "links": "",
            "autoLinks": true,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#192a25",
            "borderBottom": "1px solid #405550"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-ec5a4d0a-2e2c-42f1-a7ab-559efee59e33-d",
          "type": "section",
          "props": {
            "label": "Release desk for small teams",
            "anchor": ""
          },
          "style": {
            "paddingBlock": "clamp(58px,10vw,146px)",
            "paddingInline": "clamp(20px,6.5vw,110px)"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "block-b5d07420-0cdf-404d-8476-b1f1391881ef-c",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0,1.05fr) minmax(0,.95fr)",
                "gap": "clamp(26px,6vw,90px)",
                "alignItems": "center"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0,1fr)"
                }
              },
              "children": [
                {
                  "id": "block-b40e2f96-d4b5-4f0c-b97c-4e7ab670b92c-7",
                  "type": "section",
                  "props": {
                    "label": "Product introduction",
                    "anchor": ""
                  },
                  "style": {
                    "padding": 0,
                    "gap": 24
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-c9d91cf2-b49e-4dd7-8102-c737d8cf55be-4",
                      "type": "heading",
                      "props": {
                        "text": "Give every release an owner.",
                        "tag": "h1",
                        "anchor": ""
                      },
                      "style": {
                        "fontWeight": 700,
                        "lineHeight": ".98"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-843211fb-5b1a-4239-8533-67af416336f2-5",
                      "type": "text",
                      "props": {
                        "text": "Track what is shipping, which checks are left and who takes the next step."
                      },
                      "style": {
                        "color": "#bfcec7",
                        "maxWidth": "35ch"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-4c521a7d-ec12-4d09-8585-d06d126a68b7-6",
                      "type": "button",
                      "props": {
                        "text": "See the workflow",
                        "href": "page:page-5822c323-35e0-4e56-8b26-512a2663bae8-2",
                        "variant": "primary",
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
                  "id": "block-5bbbdd98-18ce-4a92-be83-7531ac6e6dcb-b",
                  "type": "section",
                  "props": {
                    "label": "Sample release desk",
                    "anchor": ""
                  },
                  "style": {
                    "backgroundColor": "#2a413a",
                    "padding": 26,
                    "border": "1px solid #4d6659",
                    "borderRadius": 12
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {
                      "padding": 17
                    }
                  },
                  "children": [
                    {
                      "id": "block-e0bb7235-c03b-490e-8919-9da0e001d6e0-8",
                      "type": "heading",
                      "props": {
                        "text": "Friday release",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": 30,
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-fabd5b55-4565-4a82-841c-9ed300452340-9",
                      "type": "table",
                      "props": {
                        "caption": "Sample release · open items",
                        "headers": "Check | Owner | Status",
                        "rows": "Billing copy | Lee | Ready\nMigration plan | Ari | In review\nReceipt email | Jo | Scheduled"
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-c7a5eb3e-7b6f-4689-98bc-26434d345498-a",
                      "type": "text",
                      "props": {
                        "text": "NEXT CHECKPOINT   /   FRIDAY 10:30"
                      },
                      "style": {
                        "color": "#c5f4a1",
                        "fontFamily": "IBM Plex Mono",
                        "fontSize": 12,
                        "letterSpacing": ".04em"
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
            }
          ]
        },
        {
          "id": "block-4712f9db-9a8a-448b-bf99-19fce0235880-k",
          "type": "section",
          "props": {
            "label": "From draft to handoff",
            "anchor": ""
          },
          "style": {
            "paddingBlock": "clamp(40px,7vw,100px)",
            "paddingInline": "clamp(20px,6.5vw,110px)",
            "borderTop": "1px solid #405550"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "block-7def6dca-7617-4fe4-ae8c-d5d573fd41ea-e",
              "type": "heading",
              "props": {
                "text": "From draft to handoff",
                "tag": "h2",
                "anchor": ""
              },
              "style": {
                "fontWeight": 700
              },
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "block-e2a2678e-2ee4-428b-89ae-4bcc0a843ea0-i",
              "type": "columns",
              "props": {
                "columns": "3"
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0,1fr)"
                }
              },
              "children": [
                {
                  "id": "block-e9ac9941-2a6f-4628-af63-7b68fc3a7463-f",
                  "type": "card",
                  "props": {
                    "title": "Plan",
                    "text": "Give each check a name, an owner and a due time.",
                    "image": "",
                    "alt": ""
                  },
                  "style": {
                    "backgroundColor": "#1d302b",
                    "borderColor": "#4d6659"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "block-49635fa1-9797-47be-a918-bd933bbbd153-g",
                  "type": "card",
                  "props": {
                    "title": "Review",
                    "text": "Collect open questions in the release so the reviewers can find them.",
                    "image": "",
                    "alt": ""
                  },
                  "style": {
                    "backgroundColor": "#1d302b",
                    "borderColor": "#4d6659"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": []
                },
                {
                  "id": "block-e45b1899-7752-4315-add9-ae27c8a7d61b-h",
                  "type": "card",
                  "props": {
                    "title": "Hand off",
                    "text": "Record what shipped and the follow-up work for the next release.",
                    "image": "",
                    "alt": ""
                  },
                  "style": {
                    "backgroundColor": "#1d302b",
                    "borderColor": "#4d6659"
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
              "id": "block-06b7cf65-fe4e-432c-8bd5-64758eb59a5d-j",
              "type": "link",
              "props": {
                "text": "Read the release notes",
                "href": "page:page-ac2af9e5-bdf5-42f7-aee5-1cee26d534ca-3",
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
          "id": "block-a48c9bba-bc4c-44a8-ab42-785b8e282ba3-m",
          "type": "footer",
          "props": {
            "brand": "relayboard.",
            "text": "A release desk for small product teams.",
            "links": "",
            "autoLinks": true
          },
          "style": {
            "borderTop": "1px solid #405550"
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
      "id": "page-5822c323-35e0-4e56-8b26-512a2663bae8-2",
      "name": "Workflow",
      "slug": "workflow",
      "blocks": [
        {
          "id": "block-3a93ddbc-9cbe-4145-a4f5-ade5388d4939-r",
          "type": "nav",
          "props": {
            "brand": "relayboard.",
            "links": "",
            "autoLinks": true,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#192a25",
            "borderBottom": "1px solid #405550"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-e137017b-1ba6-451d-bdf6-3af1290f8d83-n",
          "type": "hero",
          "props": {
            "eyebrow": "",
            "title": "The release workflow",
            "text": "Use the same checks for a quiet fix and a larger launch.",
            "buttonText": "",
            "buttonLink": "#",
            "image": "",
            "alt": "",
            "caption": "",
            "layout": "split"
          },
          "style": {
            "titleSize": "clamp(44px,7vw,98px)"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-2bcfa2b8-7154-4955-a1f6-7d79c6e5f8d3-q",
          "type": "section",
          "props": {
            "label": "Release checklist",
            "anchor": ""
          },
          "style": {
            "paddingBlock": "clamp(40px,7vw,100px)",
            "paddingInline": "clamp(20px,6.5vw,110px)"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "block-b5cc6b0b-f8df-4310-ae2a-ddf3da989eec-o",
              "type": "table",
              "props": {
                "caption": "Release checklist",
                "headers": "Stage | Evidence | Owner",
                "rows": "Draft | Changed areas listed | Author\nReview | Risks and rollback reviewed | Reviewer\nRelease | Deploy time and smoke test recorded | Release lead\nHandoff | Follow-up owner recorded | Release lead"
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "block-c7eb0fe1-788a-4cfc-ad7f-b01385351e7b-p",
              "type": "button",
              "props": {
                "text": "View release notes",
                "href": "page:page-ac2af9e5-bdf5-42f7-aee5-1cee26d534ca-3",
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
          "id": "block-e84e2793-07f1-40b9-8cc2-5adcc1c8c4c7-s",
          "type": "footer",
          "props": {
            "brand": "relayboard.",
            "text": "A release desk for small product teams.",
            "links": "",
            "autoLinks": true
          },
          "style": {
            "borderTop": "1px solid #405550"
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
      "id": "page-ac2af9e5-bdf5-42f7-aee5-1cee26d534ca-3",
      "name": "Release notes",
      "slug": "releases",
      "blocks": [
        {
          "id": "block-51eef91b-4509-4d6c-ac21-c7aea84d82e5-10",
          "type": "nav",
          "props": {
            "brand": "relayboard.",
            "links": "",
            "autoLinks": true,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#192a25",
            "borderBottom": "1px solid #405550"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-4cc8db27-f0b0-400d-ada6-89b33a842d23-t",
          "type": "hero",
          "props": {
            "eyebrow": "",
            "title": "Release notes",
            "text": "A sample changelog for the workspace shown on Home.",
            "buttonText": "",
            "buttonLink": "#",
            "image": "",
            "alt": "",
            "caption": "",
            "layout": "split"
          },
          "style": {
            "titleSize": "clamp(44px,7vw,98px)"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-a9787f4a-3d2c-4422-aa35-5d52ac4e42fc-z",
          "type": "section",
          "props": {
            "label": "Changelog",
            "anchor": ""
          },
          "style": {
            "paddingBlock": "clamp(40px,7vw,100px)",
            "paddingInline": "clamp(20px,6.5vw,110px)",
            "borderTop": "1px solid #405550"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "block-ea64ca5d-26cb-46f0-b159-e5bc829b8253-u",
              "type": "heading",
              "props": {
                "text": "Release ownership",
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
              "id": "block-7debe7ed-df0f-40df-a61a-3e08f64c70c7-v",
              "type": "text",
              "props": {
                "text": "Each checklist item now keeps one named owner. A handoff can list a different owner for the follow-up work."
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "block-7212fa06-e373-4f3c-a279-34ed0e494cca-w",
              "type": "heading",
              "props": {
                "text": "Release history",
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
              "id": "block-46c72c9c-c470-4a54-a0b8-5834177a7d80-x",
              "type": "text",
              "props": {
                "text": "Completed releases retain their final checklist and the notes written during handoff."
              },
              "style": {},
              "styles": {
                "tablet": {},
                "mobile": {}
              },
              "children": []
            },
            {
              "id": "block-e7664aa5-34f8-4176-9270-136470560080-y",
              "type": "link",
              "props": {
                "text": "Return to the workflow",
                "href": "page:page-5822c323-35e0-4e56-8b26-512a2663bae8-2",
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
          "id": "block-fe2c8957-31ee-4973-8b87-c8fbd5158935-11",
          "type": "footer",
          "props": {
            "brand": "relayboard.",
            "text": "A release desk for small product teams.",
            "links": "",
            "autoLinks": true
          },
          "style": {
            "borderTop": "1px solid #405550"
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
