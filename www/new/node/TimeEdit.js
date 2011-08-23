Ext.define('PVE.node.TimeEdit', {
    extend: 'Ext.window.Window',
    requires: ['PVE.data.TimezoneStore'],
    alias: ['widget.pveNodeTimeEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var formpanel = Ext.create('Ext.form.Panel', {
	    url: "/api2/extjs/nodes/" + nodename + "/time",
	    method: 'PUT',
	    trackResetOnLoad: true,
	    bodyPadding: 10,
	    
	    fieldDefaults: {
		labelWidth: 80,
		anchor: '100%'
            },

	    items: {
		xtype: 'combo',
                fieldLabel: 'Time zone',
                name: 'timezone',
		queryMode: 'local',
		store: new PVE.data.TimezoneStore({autoDestory: true}),
		valueField: 'zone',
 		displayField: 'zone',
		triggerAction: 'all',
		forceSelection: true,
		editable: false,
                allowBlank: false
	    }
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
	    title: "Set time zone",
	    modal: true,
            width: 400,
	    height: 110,
	    layout: 'fit',
	    border: false,
	    items: formpanel,
	    buttons: [ submitBtn, resetBtn ]
	});

	me.callParent();
    }
});
