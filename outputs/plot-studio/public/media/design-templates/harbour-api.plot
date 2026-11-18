{
  "version": 1,
  "name": "Harbour API",
  "settings": {
    "font": "Inter",
    "headingFont": "Inter",
    "accent": "#2036a9",
    "background": "#f6f8fb",
    "textColor": "#17213c",
    "customCss": "",
    "customJs": "",
    "h1Size": "clamp(42px,6.4vw,86px)",
    "h2Size": "clamp(28px,3.9vw,52px)",
    "h3Size": "clamp(21px,2.8vw,34px)"
  },
  "pages": [
    {
      "id": "page-5fdf96c9-e1fd-47be-bfcc-cd1a862db0c8-55",
      "name": "Home",
      "slug": "index",
      "blocks": [
        {
          "id": "block-897b35dd-5c5a-4ac1-98c6-dd0dade75d06-5q",
          "type": "nav",
          "props": {
            "brand": "HARBOUR API",
            "links": "",
            "autoLinks": true,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#edf0f9",
            "borderBottom": "1px solid #cad2e6"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-8e182d43-036a-4b5d-b730-71e9fc6c65ca-5e",
          "type": "section",
          "props": {
            "label": "API documentation introduction",
            "anchor": ""
          },
          "style": {
            "paddingBlock": "clamp(40px,7vw,100px)",
            "paddingInline": "clamp(20px,6.5vw,110px)",
            "backgroundColor": "#e0e6f8",
            "borderBottom": "1px solid #cad2e6"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": [
            {
              "id": "block-a0f0e964-116d-489d-94a2-d820e62cc9a0-5d",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(0,1.2fr) minmax(0,.8fr)",
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
                  "id": "block-f404a8e1-4d18-4db6-b48f-e34c3b480aee-5b",
                  "type": "section",
                  "props": {
                    "label": "Get started",
                    "anchor": ""
                  },
                  "style": {
                    "padding": 0,
                    "gap": 22
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-34a87362-6457-493a-b3b5-6ffd4b4798ac-58",
                      "type": "heading",
                      "props": {
                        "text": "Harbour API docs",
                        "tag": "h1",
                        "anchor": ""
                      },
                      "style": {
                        "fontWeight": 700,
                        "lineHeight": "1.02",
                        "letterSpacing": "-.055em"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-a09fd169-bdbd-40d6-9613-92fd956454c3-59",
                      "type": "text",
                      "props": {
                        "text": "Follow a parcel from collection to delivery using status events and tracking references."
                      },
                      "style": {
                        "fontSize": 15,
                        "lineHeight": "1.6",
                        "maxWidth": "64ch"
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-28925be0-860b-41e7-96d2-331bd32833e2-5a",
                      "type": "button",
                      "props": {
                        "text": "Read the request reference",
                        "href": "page:page-31b0d9f5-7603-49ad-b60d-dc20cd6ca429-56",
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
                  "id": "block-e802cb9c-607a-4dd0-a177-a44a1872b0a5-5c",
                  "type": "code",
                  "props": {
                    "language": "JSON response · example",
                    "code": "{\n  \"trackingId\": \"HB-19042\",\n  \"status\": \"out_for_delivery\",\n  \"events\": [\n    { \"type\": \"collected\" },\n    { \"type\": \"out_for_delivery\" }\n  ]\n}"
                  },
                  "style": {
                    "fontSize": 14,
                    "border": "1px solid #cad2e6",
                    "padding": 12
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
          "id": "block-e9708ff5-c451-40e7-9771-d01d04e27818-5p",
          "type": "section",
          "props": {
            "label": "Start here",
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
              "id": "block-66cd12ea-d772-4728-942d-9405fb5c4258-5o",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(190px,.25fr) minmax(0,.75fr)",
                "gap": "clamp(24px,5vw,70px)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0,1fr)"
                }
              },
              "children": [
                {
                  "id": "block-399c96cd-0748-4ce0-b5a0-5baa4b5cf183-5m",
                  "type": "section",
                  "props": {
                    "label": "Documentation navigation",
                    "anchor": ""
                  },
                  "style": {
                    "backgroundColor": "#e8edf8",
                    "padding": 20,
                    "gap": 12,
                    "border": "1px solid #cad2e6"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-40186691-a991-4a29-8201-c604f3234b1d-5i",
                      "type": "heading",
                      "props": {
                        "text": "Documentation",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": 18,
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-034ae5f5-ab49-47cc-8192-542f66e1668f-5j",
                      "type": "link",
                      "props": {
                        "text": "Start here",
                        "href": "page:page-5fdf96c9-e1fd-47be-bfcc-cd1a862db0c8-55",
                        "newTab": false
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-e80b3294-ec5d-4ddb-9dda-b9ac27d8b33c-5k",
                      "type": "link",
                      "props": {
                        "text": "Request reference",
                        "href": "page:page-31b0d9f5-7603-49ad-b60d-dc20cd6ca429-56",
                        "newTab": false
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-b8af9766-326f-4f6b-a8ed-6f736bd0a971-5l",
                      "type": "link",
                      "props": {
                        "text": "Errors",
                        "href": "page:page-99657a05-d9aa-41ec-b514-dd60255d72b3-57",
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
                  "id": "block-7b35e0c3-e121-467d-b7ba-7b65fcf99e83-5n",
                  "type": "section",
                  "props": {
                    "label": "Start here",
                    "anchor": ""
                  },
                  "style": {
                    "padding": 0,
                    "gap": 21
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-1981f10f-2571-4b26-9bf3-5fe0ffb3482d-5f",
                      "type": "heading",
                      "props": {
                        "text": "Start here",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-ef626678-9b48-401b-8133-449c8eb83c67-5g",
                      "type": "text",
                      "props": {
                        "text": "Use the request reference to find a shipment by its tracking ID. Every response includes one current status and a chronological list of events."
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-4dedb74c-be7d-40fb-a075-c7902883bdd7-5h",
                      "type": "link",
                      "props": {
                        "text": "How errors are returned",
                        "href": "page:page-99657a05-d9aa-41ec-b514-dd60255d72b3-57",
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
          "id": "block-72cecdb8-4c5a-4b78-b1fb-850099efd7c6-5r",
          "type": "footer",
          "props": {
            "brand": "HARBOUR API",
            "text": "Example shipping API reference.",
            "links": "",
            "autoLinks": true
          },
          "style": {
            "borderTop": "1px solid #cad2e6"
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
      "id": "page-31b0d9f5-7603-49ad-b60d-dc20cd6ca429-56",
      "name": "Request reference",
      "slug": "requests",
      "blocks": [
        {
          "id": "block-5abdda3a-89fa-465a-86e1-b5cd60869583-66",
          "type": "nav",
          "props": {
            "brand": "HARBOUR API",
            "links": "",
            "autoLinks": true,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#edf0f9",
            "borderBottom": "1px solid #cad2e6"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-77b28ffc-00cf-43c6-bc29-ec533af2a812-5s",
          "type": "hero",
          "props": {
            "eyebrow": "",
            "title": "Request reference",
            "text": "Request a single shipment and read the tracking history.",
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
          "id": "block-982b772c-bbbe-4d22-a851-cb2a59c1c8ea-65",
          "type": "section",
          "props": {
            "label": "Shipment lookup",
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
              "id": "block-ba83a3bf-d096-4661-924d-2e36c326ca21-64",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(190px,.25fr) minmax(0,.75fr)",
                "gap": "clamp(24px,5vw,70px)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0,1fr)"
                }
              },
              "children": [
                {
                  "id": "block-55e4ee80-9d99-4eeb-a165-b1bbb0cd897e-62",
                  "type": "section",
                  "props": {
                    "label": "Documentation navigation",
                    "anchor": ""
                  },
                  "style": {
                    "backgroundColor": "#e8edf8",
                    "padding": 20,
                    "gap": 12,
                    "border": "1px solid #cad2e6"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-9e168b8a-6943-476e-88bc-98b0588339be-5y",
                      "type": "heading",
                      "props": {
                        "text": "Documentation",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": 18,
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-d33412ac-38ba-499c-ab0b-ef21c106c674-5z",
                      "type": "link",
                      "props": {
                        "text": "Start here",
                        "href": "page:page-5fdf96c9-e1fd-47be-bfcc-cd1a862db0c8-55",
                        "newTab": false
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-5ec489ff-0e53-4018-b280-c25e6621ad15-60",
                      "type": "link",
                      "props": {
                        "text": "Request reference",
                        "href": "page:page-31b0d9f5-7603-49ad-b60d-dc20cd6ca429-56",
                        "newTab": false
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-cbf407d2-d9ff-427d-b87c-ea6a8bb0c9bb-61",
                      "type": "link",
                      "props": {
                        "text": "Errors",
                        "href": "page:page-99657a05-d9aa-41ec-b514-dd60255d72b3-57",
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
                  "id": "block-034b0558-7bcc-44e8-bee9-cd0066995604-63",
                  "type": "section",
                  "props": {
                    "label": "Shipment lookup",
                    "anchor": ""
                  },
                  "style": {
                    "padding": 0,
                    "gap": 21
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-32fe20ee-d98d-4301-ba0a-f3a5cbe4f982-5t",
                      "type": "heading",
                      "props": {
                        "text": "Shipment lookup",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-9a5013f5-2b06-4006-a239-532a1a5e1f14-5u",
                      "type": "code",
                      "props": {
                        "language": "HTTP route",
                        "code": "GET /v1/shipments/{trackingId}\nAccept: application/json"
                      },
                      "style": {
                        "fontSize": 14,
                        "border": "1px solid #cad2e6",
                        "padding": 12
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-079a9e40-a8d8-42a6-b907-6fbd53d06aa1-5v",
                      "type": "table",
                      "props": {
                        "caption": "Path parameters",
                        "headers": "Name | Type | Meaning",
                        "rows": "trackingId | string | Shipment reference, for example HB-19042"
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-4b32a1a6-30f3-4092-a75b-d1ccdf70dac8-5w",
                      "type": "text",
                      "props": {
                        "text": "The successful response is HTTP 200. Use the status field to display the current position and the events array to build a timeline."
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-08b2c1bf-afef-4e17-8fb8-d64739080359-5x",
                      "type": "button",
                      "props": {
                        "text": "See the error codes",
                        "href": "page:page-99657a05-d9aa-41ec-b514-dd60255d72b3-57",
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
                }
              ]
            }
          ]
        },
        {
          "id": "block-fe4dfd49-4cb4-4d55-908d-343cf371babc-67",
          "type": "footer",
          "props": {
            "brand": "HARBOUR API",
            "text": "Example shipping API reference.",
            "links": "",
            "autoLinks": true
          },
          "style": {
            "borderTop": "1px solid #cad2e6"
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
      "id": "page-99657a05-d9aa-41ec-b514-dd60255d72b3-57",
      "name": "Errors",
      "slug": "errors",
      "blocks": [
        {
          "id": "block-2086d828-9835-4c58-a10f-cff44f83c73f-6l",
          "type": "nav",
          "props": {
            "brand": "HARBOUR API",
            "links": "",
            "autoLinks": true,
            "buttonText": "",
            "buttonLink": ""
          },
          "style": {
            "backgroundColor": "#edf0f9",
            "borderBottom": "1px solid #cad2e6"
          },
          "styles": {
            "tablet": {},
            "mobile": {}
          },
          "children": []
        },
        {
          "id": "block-3b2016e8-e401-44c0-8651-27eb1632a7ba-68",
          "type": "hero",
          "props": {
            "eyebrow": "",
            "title": "Errors",
            "text": "Check the status before updating the tracking view.",
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
          "id": "block-9f3e4b98-eefc-40e1-8533-9e7b9d581819-6k",
          "type": "section",
          "props": {
            "label": "Response errors",
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
              "id": "block-068fcb0e-ac26-4ac6-8d1f-7b7af1b9bd12-6j",
              "type": "columns",
              "props": {
                "columns": "2"
              },
              "style": {
                "gridTemplateColumns": "minmax(190px,.25fr) minmax(0,.75fr)",
                "gap": "clamp(24px,5vw,70px)"
              },
              "styles": {
                "tablet": {},
                "mobile": {
                  "gridTemplateColumns": "minmax(0,1fr)"
                }
              },
              "children": [
                {
                  "id": "block-c544008d-9f4e-4146-b6a0-b530aee16459-6h",
                  "type": "section",
                  "props": {
                    "label": "Documentation navigation",
                    "anchor": ""
                  },
                  "style": {
                    "backgroundColor": "#e8edf8",
                    "padding": 20,
                    "gap": 12,
                    "border": "1px solid #cad2e6"
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-8652a729-ff74-4740-a088-bf0fad5edfc9-6d",
                      "type": "heading",
                      "props": {
                        "text": "Documentation",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontSize": 18,
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-df998d63-fe45-46c8-bb67-66ac1b394c87-6e",
                      "type": "link",
                      "props": {
                        "text": "Start here",
                        "href": "page:page-5fdf96c9-e1fd-47be-bfcc-cd1a862db0c8-55",
                        "newTab": false
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-292f0708-460e-4040-8868-3aa05a019d58-6f",
                      "type": "link",
                      "props": {
                        "text": "Request reference",
                        "href": "page:page-31b0d9f5-7603-49ad-b60d-dc20cd6ca429-56",
                        "newTab": false
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-6d1f6320-a670-455f-b5f8-9ae879928d6e-6g",
                      "type": "link",
                      "props": {
                        "text": "Errors",
                        "href": "page:page-99657a05-d9aa-41ec-b514-dd60255d72b3-57",
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
                  "id": "block-67b3e05d-474f-41fe-86fb-5d6231641563-6i",
                  "type": "section",
                  "props": {
                    "label": "Response errors",
                    "anchor": ""
                  },
                  "style": {
                    "padding": 0,
                    "gap": 21
                  },
                  "styles": {
                    "tablet": {},
                    "mobile": {}
                  },
                  "children": [
                    {
                      "id": "block-2da09b99-2c41-4cc8-9fac-62b60ce4f388-69",
                      "type": "heading",
                      "props": {
                        "text": "Response errors",
                        "tag": "h2",
                        "anchor": ""
                      },
                      "style": {
                        "fontWeight": 650
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-0cc53e2e-1864-40e5-aa6f-7973fea9de04-6a",
                      "type": "table",
                      "props": {
                        "caption": "Response codes",
                        "headers": "HTTP | Meaning | Client action",
                        "rows": "400 | Malformed tracking ID | Check the ID before retrying\n404 | Tracking ID not found | Show a missing shipment message\n429 | Too many requests | Wait for Retry-After before retrying"
                      },
                      "style": {},
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-fa6b0731-a516-4234-a386-fbe32f1ed0bf-6b",
                      "type": "code",
                      "props": {
                        "language": "JSON error · example",
                        "code": "{\n  \"code\": \"shipment_not_found\",\n  \"message\": \"Shipment not found.\"\n}"
                      },
                      "style": {
                        "fontSize": 14,
                        "border": "1px solid #cad2e6",
                        "padding": 12
                      },
                      "styles": {
                        "tablet": {},
                        "mobile": {}
                      },
                      "children": []
                    },
                    {
                      "id": "block-2ad7902a-7581-4bc1-a73d-e44f48725eeb-6c",
                      "type": "link",
                      "props": {
                        "text": "Return to the request reference",
                        "href": "page:page-31b0d9f5-7603-49ad-b60d-dc20cd6ca429-56",
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
          "id": "block-004e286d-024c-4dd0-a75f-460400cc4876-6m",
          "type": "footer",
          "props": {
            "brand": "HARBOUR API",
            "text": "Example shipping API reference.",
            "links": "",
            "autoLinks": true
          },
          "style": {
            "borderTop": "1px solid #cad2e6"
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
