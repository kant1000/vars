// ============================================================
// VARS — email-template
// HTML template for transactional emails sent via Resend.
//
// Placeholders replaced at send time by fillTemplate():
//   {{heading}}          — email headline (also used as <title>)
//   {{first_name}}       — recipient first name
//   {{body_paragraph_1}} — main body paragraph
//   {{body_paragraph_2}} — second paragraph (wrapped in <!--P2_START/END-->
//                          so fillTemplate removes the block when empty)
//   {{cta_label}}        — CTA button text
//   {{cta_url}}          — CTA button href
//   {{unsubscribe_url}}  — left as literal; Resend injects the real URL
//
// <!--CTA_START/END--> wraps the button block — fillTemplate removes
// the entire block when cta_label or cta_url are empty.
//
// Keep the companion email-template.html in sync when editing this.
// ============================================================

export const EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>{{heading}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
               style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:36px 40px 28px;">
              <img src="https://bookwithvars.com/vars-logo-email.png" alt="VARS" width="72" height="auto"
                   style="display:block;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding:0 40px 20px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;line-height:1.35;letter-spacing:-0.3px;">
                {{heading}}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:0 40px 28px;font-size:15px;line-height:1.65;color:#374151;">
              <p style="margin:0 0 16px;">Hi {{first_name}},</p>
              <p style="margin:0 0 16px;">{{body_paragraph_1}}</p>
              <!--P2_START--><p style="margin:0;">{{body_paragraph_2}}</p><!--P2_END-->
            </td>
          </tr>

          <!--CTA_START-->
          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:0 40px 36px;">
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:6px;background-color:#111827;mso-padding-alt:0;">
                    <a href="{{cta_url}}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;letter-spacing:0.1px;">
                      {{cta_label}}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!--CTA_END-->

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
              <p style="margin:0 0 6px;">VARS &mdash; Lagos, Nigeria</p>
              <p style="margin:0;">
                <a href="{{unsubscribe_url}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
