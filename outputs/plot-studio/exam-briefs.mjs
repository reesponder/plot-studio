export const examBriefs = {
  builder: {
    title: 'PLOT Studio Certified Builder',
    brief: 'Studio Enquiry',
    overview: 'Build the public site for a small studio that needs visitors to understand its services and send an enquiry. Make the visitor’s path from the home page to the form work on desktop and on a phone.',
    standard: 'Pass mark 80 out of 100, with the mandatory project and interaction checks met. You can submit up to three times with this enrolment.',
    tasks: [
      ['Create the three pages.', 'Use Home (index), Services (services) and Contact (contact). Add one meaningful H1 or hero heading per page. Give each page a navigation menu that reaches the other two. Add a named Home button or hero action that leads directly to Contact.'],
      ['Set the mobile layout.', 'Use a Columns block with at least two child blocks and configure an explicit one-column Phone override. Check it in the phone viewport. Give any images meaningful alt text and use direct image URLs.'],
      ['Build the contact form.', 'On Contact, add required Name (text), Email (email) and Message (textarea) fields. Keep labels clear and test the form with synthetic information.'],
      ['Wire the live result.', 'Connect the Contact form’s Form submission event to a Set text node. Target a visible text element in Contact and enter a meaningful, literal confirmation message. Prevent the native form submission so the page can display the result. Use Blueprint nodes for the behaviour.'],
      ['Test and hand it off.', 'Follow the Home link, use the navigation and submit the form at desktop and phone widths. Download your editable .plot project file from the project menu and submit it for grading.'],
    ],
  },
  architect: {
    title: 'PLOT Studio Certified Workflow Architect',
    brief: 'Workshop Requests',
    overview: 'Create a workshop intake app with a private request table, a public form and a signed partner callback. A valid request produces a new record. It remains possible to look up its status safely and handle failed requests without corrupting the data.',
    standard: 'Pass mark 85 out of 100, with the mandatory browser, data and API checks met. You can submit up to three times within 10 hours of working time. The timer begins when you select Start exam. You can take three breaks, each capped at 45 minutes.',
    tasks: [
      ['Model the data.', 'Create a private Workshop requests table with required Email (email), Seats (integer) and Status (text) fields. Use sample records only.'],
      ['Build the intake endpoint.', 'Expose POST /api/workshop-requests to site visitors. Accept a valid email and an integer seat count from 1 through 6. Convert numeric form text, such as “2”, to a number before validating. Reject missing or invalid inputs without inserting a row. Create valid rows with status new and return HTTP 201 with {id, status}. Leave email out of the response.'],
      ['Protect the lookup endpoint.', 'Build GET /api/workshop-requests/:id with API key required and the PLOT_API_KEY secret alias. A valid key and existing ID return HTTP 200 with {id, status, seats}. Missing or invalid keys return 401 and an unknown row returns 404.'],
      ['Verify the partner callback.', 'Build POST /api/workshop-events. Verify HMAC SHA-256 against request.raw and request.headers.x-workshop-signature using secret alias PLOT_SECRET_WEBHOOK. The signature can be lowercase hex, with or without a sha256= prefix. An authorised event can update an existing row to approved or rejected and returns HTTP 200 with {id, status}. Reject absent or invalid signatures and invalid statuses without writing. Return 404 for an unknown record.'],
      ['Connect the browser form.', 'Use required email and number fields with names email and seats. Prevent the native submission. Wire Form submission to Call backend route for POST /api/workshop-requests, with the Fields output connected to the request body. Route success and error to separate Set text nodes with distinct messages visible to the visitor.'],
      ['Test replay and failures.', 'Send the same signed callback twice and verify that it leaves a single correctly updated record. Check the responses for a wrong API key, a missing record, invalid input and an unsigned callback. Keep live keys, production service addresses and customer records out of the editable .plot file you submit. The grader supplies test keys and an empty database.'],
    ],
  },
};
