import {
	CreateEmailOptions,
	GetInboundEmailResponse,
	ListAttachmentsResponse,
	Resend,
	WebhookEvent
} from 'resend';

export interface Payload {
	created_at: string;
	data: {
		created_at: string;
		email_id: string;
		from: string;
		subject: string;
		to: string[];
	};
	type: WebhookEvent;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// @ts-expect-error
		const resend = new Resend(env.RESEND_API_KEY);
		const event: Payload = await request.json();
		const empty = Response.json({});

		if (event.type === 'email.received') {

			const inboundEmail: GetInboundEmailResponse  = await resend.emails.receiving.get(event.data.email_id);

			if (inboundEmail.error) {
				console.error('GetInboundEmail error', inboundEmail.error)
				return empty;
			}

			const { data: email } = inboundEmail;

			const listAttachments: ListAttachmentsResponse = await resend.attachments.receiving.list({ emailId: event.data.email_id });

			if (listAttachments.error) {
				console.error('ListAttachments error', listAttachments.error)
			}

			const { data: attachments } = listAttachments;

			const options = {
				from: env.FROM_ADDRESS,
				replyTo: event.data.from,
				to: [env.FORWARD_ADDRESS],
				subject: event.data.subject,
			} as CreateEmailOptions;

			if (email?.text) options.text = email.text;

			if (email?.html) options.html = email.html;

			options.attachments = [];

			if (attachments?.data)
				// download the attachments and encode them in base64
				for (const attachment of attachments.data) {
					try {
						const response = await fetch(attachment.download_url);
						const buffer = Buffer.from(await response.arrayBuffer());
						options.attachments.push({
							...attachment,
							content: buffer.toString('base64')
						})
					} catch (e) {
						console.error(`failed to fetch attachment ${attachment.download_url}`, e)
					}
				}

			const { data, error } = await resend.emails.send(options);

			if (error) console.error('failed to send', error)

			return Response.json(data);
		}

		return empty;
	},
} satisfies ExportedHandler<Env>;
