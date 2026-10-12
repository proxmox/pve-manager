Ext.define('PVE.form.GuestIDSelector', {
    extend: 'Ext.form.field.Number',
    alias: 'widget.pveGuestIDSelector',

    allowBlank: false,

    minValue: 100,

    maxValue: 999999999,

    validateExists: undefined,

    loadNextFreeID: false,

    guestType: undefined,

    validator: function (value) {
        var me = this;

        if (!Ext.isNumeric(value) || value < me.minValue || value > me.maxValue) {
            // check is done by ExtJS
            return true;
        }

        if (me.validateExists === true && !me.rejected) {
            return me.unknownID;
        }

        if (me.validateExists === false && me.rejected) {
            return me.nextIDError;
        }

        return true;
    },

    initComponent: function () {
        var me = this;
        var label = '{0} ID';
        var unknownID = gettext('This {0} ID does not exist');
        var inUseID = gettext('This {0} ID is already in use');
        var type = 'CT/VM';

        if (me.guestType === 'lxc') {
            type = 'CT';
        } else if (me.guestType === 'qemu') {
            type = 'VM';
        }

        me.label = Ext.String.format(label, type);
        me.unknownID = Ext.String.format(unknownID, type);
        me.inUseID = Ext.String.format(inUseID, type);

        Ext.apply(me, {
            fieldLabel: me.label,
            listeners: {
                change: function (field, newValue, oldValue) {
                    if (!Ext.isDefined(me.validateExists)) {
                        return;
                    }
                    Proxmox.Utils.API2Request({
                        params: { vmid: newValue },
                        url: '/cluster/nextid',
                        method: 'GET',
                        success: function (response, opts) {
                            me.rejected = false;
                            me.validate();
                        },
                        failure: function (response, opts) {
                            me.rejected = true;
                            // prefer translated message if guest is known to the UI
                            if (PVE.data.ResourceStore.findVMID(newValue)) {
                                me.nextIDError = me.inUseID;
                            } else {
                                let error = response.result?.errors?.vmid;
                                me.nextIDError = error
                                    ? Ext.htmlEncode(error.trim())
                                    : response.htmlStatus;
                            }
                            me.validate();
                        },
                    });
                },
            },
        });

        me.callParent();

        if (me.loadNextFreeID) {
            Proxmox.Utils.API2Request({
                url: '/cluster/nextid',
                method: 'GET',
                success: function (response, opts) {
                    me.setRawValue(response.result.data);
                },
            });
        }
    },
});
