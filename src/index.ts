import {
	CreateEmailOptions,
	GetReceivingEmailResponse,
	ListAttachmentsResponse,
	Resend,
	WebhookEvent
} from 'resend';
import { Buffer } from 'node:buffer';

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
		const addresses = env.FORWARD_ADDRESSES.split(',');

		if (event.type === 'email.received') {

			let { data: email, error: receivingError }: GetReceivingEmailResponse  = await resend.emails.receiving.get(event.data.email_id);

			if (receivingError) {
				console.error('GetInboundEmail error', receivingError)
				return empty;
			}

			const { data: attachments, error: attachmentsError }: ListAttachmentsResponse = await resend.emails.receiving.attachments.list({ emailId: event.data.email_id, limit: 10 });

			if (attachmentsError)
				console.error('ListAttachments error', attachmentsError)

			const options = {
				from: env.FROM_ADDRESS,
				replyTo: event.data.from,
				to: addresses.map(address => `${event.data.to}<${address}>`),
				subject: event.data.subject,
			} as CreateEmailOptions;

			if (email?.text) options.text = email.text;

			if (email?.html) options.html = email.html;

			options.attachments = [];

			if (Array.isArray(attachments?.data))
				for (const attachment of attachments.data) {
					try {

						const response = await fetch(attachment.download_url);
						const buffer = Buffer.from(await response.arrayBuffer());

						options.attachments.push({
							...attachment,
							content: buffer
						});

					} catch (e) {
						console.error('failed to fetch attachment:', (e as Error).message);
					}
				}

			const { data, error } = await resend.emails.send(options);

			if (error) console.error('failed to send', error)

			return Response.json(data);
		}

		return empty;
	},
} satisfies ExportedHandler<Env>;
