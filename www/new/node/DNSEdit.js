Ext.define('PVE.node.DNSEdit', {
    extend: 'Ext.window.Window',
    requires: [
	'PVE.Utils'
    ],

    alias: ['widget.pveNodeDNSEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var formpanel = Ext.create('Ext.form.Panel', {
	    url: "/api2/extjs/nodes/" + nodename + "/dns",
	    method: 'PUT',
	    trackResetOnLoad: true,
	    bodyPadding: 10,
	    
	    fieldDefaults: {
		labelWidth: 130,
		anchor: '100%'
            },
	    items: [
		{
		    xtype: 'textfield',
                    fieldLabel: 'Search domain',
                    name: 'search',
                    allowBlank: false
		},
		{
		    xtype: 'textfield',
                    fieldLabel: 'First DNS server',
		    vtype: 'IPAddress',
                    name: 'dns1'
		},
		{
		    xtype: 'textfield',
                    fieldLabel: 'Second DNS server',
 		    vtype: 'IPAddress',
                    name: 'dns2'
		},
		{
		    xtype: 'textfield',
                    fieldLabel: 'Third DNS server',
 		    vtype: 'IPAddress',
                    name: 'dns3'
		}
	    ]
	});

	var form = formpanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'OK',
	    disabled: true,
	    handler: function() {
		formpanel.submit({
		    success: function() { 
			me.close();
		    },
		    failure: function(form, action) {
			Ext.Msg.alert('Error', PVE.Utils.extractFormActionError(action));
		    }
		});
	    }
	});

	var resetBtn = Ext.create('Ext.Button', {
	    text: 'Reset',
	    disabled: true,
	    handler: function(){
		form.reset();
	    }
	});

	var set_button_status = function() {
	    var valid = form.isValid();
	    var dirty = form.isDirty();
	    submitBtn.setDisabled(!(valid && dirty));
	    resetBtn.setDisabled(!dirty);

	};

	form.on('dirtychange', set_button_status);
	form.on('validitychange', set_button_status);

	formpanel.load({
	    method: 'GET',
	    failure: function(form, action) {
		var msg = PVE.Utils.extractFormActionError(action);
		Ext.Msg.alert("Load failed", msg, function() {
		    me.close();
		});
	    }
	});


	Ext.applyIf(me, {
	    title: "Edit DNS settings",
	    modal: true,
            width: 400,
	    height: 200,
	    layout: 'fit',
	    border: false,
	    items: formpanel,
	    buttons: [ submitBtn, resetBtn ]
	});

	me.callParent();
    }
});
