Ext.define('PVE.form.GuestIDSelector', {
    extend: 'Ext.form.field.Number',
    alias: 'widget.pveGuestIDSelector',

    allowBlank: false,

    minValue: 100,

    maxValue: 999999999,

    validateExists: undefined,

    loadNextFreeID: false,

    guestType: undefined,

    initComponent: function() {
	var me = this;
	var label = '{0} ID';
	var unknownID = 'This {0} ID does not exists';
	var inUseID = 'This {0} ID is already in use';

	if (me.guestType === 'lxc') {
	    label = Ext.String.format(label, 'CT');
	    unknownID = Ext.String.format(gettext(unknownID), 'CT');
	    inUseID = Ext.String.format(gettext(inUseID), 'CT');
	} else if (me.guestType === 'qemu') {
	    label = Ext.String.format(label, 'VM');
	    unknownID = Ext.String.format(gettext(unknownID), 'VM');
	    inUseID = Ext.String.format(gettext(inUseID), 'VM');
	} else {
	    label = Ext.String.format(label, 'CT/VM');
	    unknownID = Ext.String.format(gettext(unknownID), 'CT/VM');
	    inUseID = Ext.String.format(gettext(inUseID), 'CT/VM');
	}

	Ext.apply(me, {
	    fieldLabel: label,
	    listeners: {
		'change': function(field, newValue, oldValue) {
		    if (!Ext.isDefined(me.validateExists)) {
			return;
		    }
		    PVE.Utils.API2Request({
			params: { vmid: newValue },
			url: '/cluster/nextid',
			method: 'GET',
			success: function(response, opts) {
			    if (me.validateExists === true) {
				me.markInvalid(unknownID);
			    }
			},
			failure: function(response, opts) {
			    if (me.validateExists === false) {
				me.markInvalid(inUseID);
			    }
			}
		    });
		}
	    }
	});

        me.callParent();

	if (me.loadNextFreeID) {
	    PVE.Utils.API2Request({
		url: '/cluster/nextid',
		method: 'GET',
		success: function(response, opts) {
		    me.setRawValue(response.result.data);
		}
	    });
	}
    }
});
