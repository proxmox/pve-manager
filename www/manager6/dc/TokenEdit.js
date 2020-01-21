Ext.define('PVE.dc.TokenEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcTokenEdit'],

    isAdd: true,

    initComponent: function() {
	var me = this;

	me.isCreate = !me.tokenid;

	var url;
	var method;
	var realm;

	if (me.isCreate) {
	    url = '/invalid';
	    method = 'POST';
	} else {
	    url = '/api2/extjs/access/users/' + encodeURIComponent(me.userid) + '/token/' + encodeURIComponent(me.tokenid);
	    method = 'PUT';
	}

	var column1 = [
	    {
		xtype: me.isCreate ? 'pveUserSelector' : 'displayfield',
		name: 'userid',
		fieldLabel: gettext('User'),
		value: me.userid,
		allowBlank: false,
		submitValue: me.isCreate ? true : false
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'tokenid',
		fieldLabel: gettext('Token ID'),
		value: me.tokenid,
		allowBlank: false,
		submitValue: me.isCreate ? true : false
	    }
	];

	var column2 = [
	    {
		xtype: 'proxmoxcheckbox',
		name: 'privsep',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Privilege Separation')
	    },
	    {
		xtype: 'datefield',
		name: 'expire',
		emptyText: 'never',
		format: 'Y-m-d',
		submitFormat: 'U',
		fieldLabel: gettext('Expire')
	    }
	];

	var ipanel = Ext.create('Proxmox.panel.InputPanel', {
	    column1: column1,
	    column2: column2,
	    columnB: [
		{
		    xtype: 'textfield',
		    name: 'comment',
		    fieldLabel: gettext('Comment')
		}
	    ],
	    onGetValues: function(values) {
		// hack: ExtJS datefield does not submit 0, so we need to set that
		if (!values.expire) {
		    values.expire = 0;
		}

		if (me.isCreate) {
		    if (values.tokenid && values.userid) {
			me.url = '/api2/extjs/access/users/' + encodeURIComponent(values.userid) + '/token/' + encodeURIComponent(values.tokenid);
		    } else {
			me.url = '/invalid';
		    }
		    delete values.userid;
		    delete values.tokenid;
		}

		return values;
	    }
	});

	Ext.applyIf(me, {
	    subject: gettext('User'),
	    url: url,
	    method: method,
	    fieldDefaults: {
		labelWidth: 110 // for spanish translation 
	    },
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success: function(response, options) {
		    var data = response.result.data;
		    if (Ext.isDefined(data.expire)) {
			if (data.expire) {
			    data.expire = new Date(data.expire * 1000);
			} else {
			    // display 'never' instead of '1970-01-01'
			    data.expire = null;
			}
		    }
		    me.setValues(data);
		}
	    });
	}
    },
    apiCallDone: function(success, response, options) {
	if (success && response.result.data.value) {
	    Ext.Msg.alert(gettext('API Token'), gettext('Please record the following API token value - it will only be displayed now') + ':<br/>' + response.result.data.value);
	}
    }
});
