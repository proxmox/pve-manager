Ext.define('PVE.dc.TokenEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcTokenEdit'],
    mixins: ['Proxmox.Mixin.CBind'],

    subject: gettext('Token'),
    onlineHelp: 'pveum_tokens',

    isAdd: true,
    isCreate: false,

    method: 'POST',
    url: '/api2/extjs/access/users/',

    defaultFocus: 'field[disabled=false][hidden=false][name=tokenid]',

    items: {
        xtype: 'inputpanel',
        onGetValues: function (values) {
            let me = this;
            let win = me.up('pveDcTokenEdit');
            win.url = '/api2/extjs/access/users/';
            let uid = encodeURIComponent(values.userid);
            let tid = encodeURIComponent(values.tokenid);
            delete values.userid;
            delete values.tokenid;

            // the date field only holds the day, so drop an unchanged day to keep the exact stored
            // expiration date
            if (!win.isCreate && win.originalExpire !== undefined) {
                let originalDayStart = 0;
                if (win.originalExpire) {
                    let day = new Date(win.originalExpire * 1000);
                    Ext.Date.clearTime(day);
                    originalDayStart = Math.floor(day.getTime() / 1000);
                }
                if (Number(values.expire) === originalDayStart) {
                    delete values.expire;
                }
            }

            // resolve the lifetime only now, to not lose validity time while the dialog is open
            let lifetimeField = me.down('field[name=token-lifetime]');
            if (!lifetimeField.isDisabled() && lifetimeField.getValue()) {
                values.expire =
                    Math.floor(PVE.UIOptions.serverNow() / 1000) + lifetimeField.getValue();
                // the time left until the current expiration date shrinks while the dialog is
                // open, so cap at that date where the policy forbids extending it
                if (win.expireCap) {
                    values.expire = Math.min(values.expire, win.expireCap);
                }
            }

            win.url += `${uid}/token/${tid}`;
            return values;
        },
        column1: [
            {
                xtype: 'pmxDisplayEditField',
                cbind: {
                    editable: '{isCreate}',
                },
                submitValue: true,
                editConfig: {
                    xtype: 'pmxUserSelector',
                    allowBlank: false,
                },
                name: 'userid',
                value: Proxmox.UserName,
                renderer: Ext.String.htmlEncode,
                fieldLabel: gettext('User'),
            },
            {
                xtype: 'pmxDisplayEditField',
                cbind: {
                    editable: '{isCreate}',
                },
                name: 'tokenid',
                fieldLabel: gettext('Token ID'),
                submitValue: true,
                minLength: 2,
                allowBlank: false,
            },
        ],
        column2: [
            {
                xtype: 'proxmoxcheckbox',
                name: 'privsep',
                checked: true,
                uncheckedValue: 0,
                fieldLabel: gettext('Privilege Separation'),
            },
            {
                xtype: 'pmxExpireDate',
                name: 'expire',
            },
            {
                // used instead of the date field for sub-day maximum lifetimes
                xtype: 'numberfield',
                name: 'token-lifetime',
                submitValue: false,
                hidden: true,
                disabled: true,
                allowDecimals: false,
                minValue: 1,
                fieldLabel: gettext('Lifetime (seconds)'),
            },
            {
                // offered when the policy allows extending the expiration date along with it
                xtype: 'proxmoxcheckbox',
                name: 'regenerate',
                hidden: true,
                disabled: true,
                fieldLabel: gettext('Regenerate Secret'),
                boxLabel: gettext('allows extending the expiration date'),
            },
            {
                xtype: 'displayfield',
                itemId: 'regenerateHint',
                userCls: 'pmx-hint',
                hidden: true,
                value: gettext(
                    'After saving, the current secret stops working and the new one is shown.',
                ),
            },
        ],
        columnB: [
            {
                xtype: 'textfield',
                name: 'comment',
                fieldLabel: gettext('Comment'),
            },
        ],
    },

    initComponent: function () {
        let me = this;

        me.callParent();

        // the backend enforces the policy in any case, applying it here guides the user
        me.policy = PVE.UIOptions.options['token-policy'] || {};
        if (me.policy['max-lifetime'] !== undefined) {
            me.maxLifetime = Number(me.policy['max-lifetime']);
            // computed once, so that the pre-filled default cannot drift past the bound
            let now = PVE.UIOptions.serverNow();
            me.maxDate = new Date(now + me.maxLifetime * 1000);
            // the date field only offers midnights, at best covering an arbitrary part of a sub-day
            // maximum, and on a 25 hour DST day a one day maximum may contain no midnight at all
            let nextMidnight = new Date(now);
            nextMidnight.setHours(24, 0, 0, 0);
            me.useLifetimeField = me.maxLifetime < 86400 || nextMidnight > me.maxDate;
        }
        me.expiryRequired = !!Number(me.policy['require-expiry']) || me.maxDate !== undefined;

        if (me.isCreate) {
            me.applyPolicyOnCreate();
        } else {
            me.load({
                success: function (response, options) {
                    me.setValues(response.result.data);
                    me.applyPolicyOnEdit();
                },
            });
        }
    },

    applyPolicyOnCreate: function () {
        let me = this;

        let expireField = me.down('field[name=expire]');
        if (me.useLifetimeField) {
            expireField.setVisible(false);
            expireField.setDisabled(true);
            let lifetimeField = me.down('field[name=token-lifetime]');
            lifetimeField.setVisible(true);
            lifetimeField.setDisabled(false);
            lifetimeField.setMaxValue(me.maxLifetime);
            lifetimeField.allowBlank = false;
        } else {
            if (me.maxDate) {
                expireField.setMaxValue(me.maxDate);
                expireField.setValue(me.maxDate);
            }
            if (me.expiryRequired) {
                expireField.allowBlank = false;
            }
        }

        if (Number(me.policy['require-privilege-separation'])) {
            let privilegeSeparationField = me.down('field[name=privsep]');
            privilegeSeparationField.setValue(true);
            privilegeSeparationField.setDisabled(true);
        }
    },

    applyPolicyOnEdit: function () {
        let me = this;

        // privilege separation cannot be disabled again, while enabling it for a token that
        // predates the policy stays possible
        let privilegeSeparationField = me.down('field[name=privsep]');
        if (
            Number(me.policy['require-privilege-separation']) &&
            privilegeSeparationField.getValue()
        ) {
            privilegeSeparationField.setDisabled(true);
        }

        // the policy may forbid moving the expiration date later or removing it
        let noExtension = !!Number(me.policy['disallow-expiry-extension']) && !!me.originalExpire;
        if (noExtension && Number(me.policy['allow-extension-on-regenerate'])) {
            let regenerateField = me.down('field[name=regenerate]');
            let regenerateHint = me.down('#regenerateHint');
            regenerateField.setVisible(true);
            regenerateField.setDisabled(false);
            regenerateField.on('change', (_field, regenerate) => {
                regenerateHint.setVisible(regenerate);
                me.applyExpiryBounds(!regenerate);
            });
        }
        me.applyExpiryBounds(noExtension);
    },

    // bound a new expiration date by the maximum lifetime and, if extending is forbidden, by the
    // current one
    applyExpiryBounds: function (noExtension) {
        let me = this;

        let expireField = me.down('field[name=expire]');
        if (me.useLifetimeField) {
            // keep the current date visible but read-only, an empty lifetime keeps it
            expireField.setDisabled(true);
            let maxValue = me.maxLifetime;
            me.expireCap = noExtension ? me.originalExpire : undefined;
            if (noExtension) {
                let remaining = me.originalExpire - Math.floor(PVE.UIOptions.serverNow() / 1000);
                maxValue = Math.min(maxValue, remaining);
            }
            // an already expired token has nothing left to shorten
            let usable = maxValue >= 1;
            let lifetimeField = me.down('field[name=token-lifetime]');
            lifetimeField.setVisible(usable);
            lifetimeField.setDisabled(!usable);
            if (usable) {
                lifetimeField.setMaxValue(maxValue);
                lifetimeField.setEmptyText(gettext('unchanged'));
            }
            return;
        }

        // removing an existing expiration date is a change the policy rejects; for a token without
        // one, the field may stay blank, as the unchanged value is not submitted
        expireField.allowBlank = !(me.originalExpire && (me.expiryRequired || noExtension));

        // bound by the maximum lifetime only if the current date conforms, else the form would be
        // stuck invalid for tokens that predate the policy, blocking edits the backend allows
        let current = me.originalExpire ? new Date(me.originalExpire * 1000) : undefined;
        let bound;
        if (me.maxDate && (!current || current <= me.maxDate)) {
            bound = me.maxDate;
        }
        if (noExtension && (!bound || current < bound)) {
            // the date field compares whole days, so the current day stays selectable and is
            // then dropped from submission as unchanged
            bound = current;
        }
        expireField.setMaxValue(bound);
        expireField.validate();
    },

    setValues: function (values) {
        let me = this;
        // remember the stored expiration date to detect a real change on submission; the
        // token grid's record carries it as a Date object, the API as epoch seconds
        if (!me.isCreate && values.expire !== undefined) {
            me.originalExpire =
                values.expire instanceof Date
                    ? Math.floor(values.expire.getTime() / 1000)
                    : Number(values.expire);
        }
        me.callParent([values]);
    },

    apiCallDone: function (success, response, options) {
        let res = response.result.data;
        if (!success || !res.value) {
            return;
        }

        Ext.create('PVE.dc.TokenShow', {
            autoShow: true,
            tokenid: res['full-tokenid'],
            secret: res.value,
        });
    },
});

Ext.define('PVE.dc.TokenShow', {
    extend: 'Ext.window.Window',
    alias: ['widget.pveTokenShow'],
    mixins: ['Proxmox.Mixin.CBind'],

    width: 600,
    modal: true,
    resizable: false,
    title: gettext('Token Secret'),

    items: [
        {
            xtype: 'container',
            layout: 'form',
            bodyPadding: 10,
            border: false,
            fieldDefaults: {
                labelWidth: 100,
                anchor: '100%',
            },
            padding: '0 10 10 10',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: gettext('Token ID'),
                    cbind: {
                        value: '{tokenid}',
                    },
                    editable: false,
                },
                {
                    xtype: 'textfield',
                    fieldLabel: gettext('Secret'),
                    inputId: 'token-secret-value',
                    cbind: {
                        value: '{secret}',
                    },
                    editable: false,
                },
            ],
        },
        {
            xtype: 'component',
            border: false,
            padding: '10 10 10 10',
            userCls: 'pmx-hint',
            html: gettext('Please record the API token secret - it will only be displayed now'),
        },
    ],
    buttons: [
        {
            handler: function (b) {
                document.getElementById('token-secret-value').select();
                document.execCommand('copy');
            },
            text: gettext('Copy Secret Value'),
            iconCls: 'fa fa-clipboard',
        },
    ],
});
